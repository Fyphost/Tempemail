import pg from "pg";

import { sslOption } from "@/server/db/client";
import { getEnv } from "@/server/env";
import { logger } from "@/server/logger";
import { jobStatusFor, processIngestJob } from "@/server/mail/processor";
import { JOBS_CHANNEL } from "@/server/realtime/events";

import { claimIngestJob, completeIngestJob, failIngestJob } from "./queue";

async function handleJob(): Promise<boolean> {
  const job = await claimIngestJob();
  if (!job) return false;
  try {
    const result = await processIngestJob(job);
    await completeIngestJob(job.id, jobStatusFor(result), result);
    logger.debug("Processed ingest job", { jobId: job.id, delivered: result.delivered });
  } catch (error) {
    await failIngestJob(job, error);
  }
  return true;
}

/** Process every runnable job now (used by tests and the CLI). */
export async function drainIngestQueue(maxJobs = 1_000): Promise<number> {
  let processed = 0;
  while (processed < maxJobs && (await handleJob())) processed += 1;
  return processed;
}

/**
 * Background consumer: wakes on NOTIFY for low latency and polls as a
 * fallback, running up to `concurrency` jobs in parallel.
 */
export class IngestRunner {
  private active = 0;
  private stopped = false;
  private pollTimer: NodeJS.Timeout | null = null;
  private listener: pg.Client | null = null;

  constructor(
    private readonly concurrency: number,
    private readonly pollIntervalMs = 5_000,
  ) {}

  async start(): Promise<void> {
    this.stopped = false;
    await this.connectListener();
    this.pollTimer = setInterval(() => this.kick(), this.pollIntervalMs);
    this.kick();
  }

  private async connectListener(): Promise<void> {
    const env = getEnv();
    const client = new pg.Client({
      connectionString: env.DATABASE_URL,
      ssl: sslOption(env.DATABASE_SSL),
      application_name: "tempemail-worker-listener",
      keepAlive: true,
    });
    client.on("notification", () => this.kick());
    client.on("error", (error) => {
      logger.warn("Job listener error; relying on polling until reconnect", { error });
      this.listener = null;
      client.removeAllListeners();
      client.end().catch(() => undefined);
      if (!this.stopped) {
        setTimeout(() => {
          this.connectListener().catch((reconnectError: unknown) =>
            logger.warn("Job listener reconnect failed", { error: reconnectError }),
          );
        }, 5_000).unref?.();
      }
    });
    await client.connect();
    await client.query(`LISTEN ${JOBS_CHANNEL}`);
    this.listener = client;
  }

  kick(): void {
    while (!this.stopped && this.active < this.concurrency) {
      this.active += 1;
      void this.loop().finally(() => {
        this.active -= 1;
      });
    }
  }

  private async loop(): Promise<void> {
    try {
      while (!this.stopped && (await handleJob())) {
        // keep draining
      }
    } catch (error) {
      logger.error("Ingest runner loop error", { error });
    }
  }

  async stop(timeoutMs = 20_000): Promise<void> {
    this.stopped = true;
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = null;
    const listener = this.listener;
    this.listener = null;
    if (listener) {
      listener.removeAllListeners();
      await listener.end().catch(() => undefined);
    }
    const deadline = Date.now() + timeoutMs;
    while (this.active > 0 && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
}
