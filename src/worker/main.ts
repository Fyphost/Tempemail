import { createServer, type Server } from "node:http";
import os from "node:os";

import { ensureBootstrapAdmin } from "@/server/auth/users";
import { closeDb, getPool } from "@/server/db/client";
import { getEnv } from "@/server/env";
import { LOCKS, recheckDomains, runCleanup, withAdvisoryLock } from "@/server/jobs/cleanup";
import { startHeartbeat } from "@/server/jobs/heartbeat";
import { IngestRunner } from "@/server/jobs/runner";
import { logger } from "@/server/logger";
import { closeSmtpServer, createSmtpServer, listen, watchTlsCertificate } from "@/server/mail/smtp";
import { flushApiRequestCount } from "@/server/stats";

const CLEANUP_INTERVAL_MS = 60_000;
const DNS_INTERVAL_MS = 10 * 60_000;

function every(intervalMs: number, label: string, task: () => Promise<unknown>): NodeJS.Timeout {
  let running = false;
  const run = () => {
    if (running) return;
    running = true;
    task()
      .catch((error: unknown) => logger.error(`${label} failed`, { error }))
      .finally(() => {
        running = false;
      });
  };
  setTimeout(run, 2_000).unref();
  return setInterval(run, intervalMs);
}

function startHealthServer(port: number, state: { ready: boolean }): Server {
  const server = createServer((request, response) => {
    if (request.url !== "/healthz") {
      response.writeHead(404).end();
      return;
    }
    getPool()
      .query("select 1")
      .then(() => {
        response.writeHead(state.ready ? 200 : 503, { "content-type": "application/json" });
        response.end(JSON.stringify({ status: state.ready ? "ok" : "starting" }));
      })
      .catch(() => {
        response.writeHead(503, { "content-type": "application/json" });
        response.end(JSON.stringify({ status: "database_unavailable" }));
      });
  });
  server.on("error", (error) => {
    logger.warn("Worker health endpoint could not start; continuing without it", { port, error });
  });
  server.listen(port, "0.0.0.0");
  return server;
}

async function main(): Promise<void> {
  const env = getEnv();
  const state = { ready: false };
  const health = startHealthServer(Number(process.env.WORKER_HEALTH_PORT ?? 8081), state);

  await getPool().query("select 1");
  await ensureBootstrapAdmin().catch((error: unknown) => {
    logger.error(
      "Could not create the bootstrap administrator (check ADMIN_BOOTSTRAP_EMAIL/PASSWORD)",
      {
        error: error instanceof Error ? error.message : String(error),
      },
    );
  });

  const runner = new IngestRunner(env.WORKER_CONCURRENCY);
  await runner.start();
  logger.info("Ingest runner started", { concurrency: env.WORKER_CONCURRENCY });

  let smtp: Awaited<ReturnType<typeof createSmtpServer>> | null = null;
  if (env.SMTP_ENABLED) {
    smtp = await createSmtpServer({
      hostname: env.SMTP_HOSTNAME ?? os.hostname(),
      tlsKeyFile: env.SMTP_TLS_KEY_FILE,
      tlsCertFile: env.SMTP_TLS_CERT_FILE,
      maxClients: env.SMTP_MAX_CLIENTS,
      useProxyProtocol: env.SMTP_USE_PROXY_PROTOCOL,
      onQueued: () => runner.kick(),
    });
    await listen(smtp, env.SMTP_PORT, env.SMTP_BIND_HOST);
    watchTlsCertificate(smtp, {
      tlsKeyFile: env.SMTP_TLS_KEY_FILE,
      tlsCertFile: env.SMTP_TLS_CERT_FILE,
    });
    logger.info("SMTP server listening", {
      host: env.SMTP_BIND_HOST,
      port: env.SMTP_PORT,
      starttls: Boolean(env.SMTP_TLS_KEY_FILE && env.SMTP_TLS_CERT_FILE),
    });
  }

  const timers = [
    every(CLEANUP_INTERVAL_MS, "Cleanup", async () => {
      const report = await withAdvisoryLock(LOCKS.cleanup, runCleanup);
      if (report && (report.expiredInboxes > 0 || report.jobsPurged > 0)) {
        logger.info("Cleanup completed", { ...report });
      }
    }),
    every(DNS_INTERVAL_MS, "DNS verification", () =>
      withAdvisoryLock(LOCKS.dns, () => recheckDomains()),
    ),
  ];

  state.ready = true;
  const heartbeat = startHeartbeat(() => ({
    smtpListening: smtp !== null && state.ready,
    smtpPort: smtp ? env.SMTP_PORT : null,
    smtpTls: Boolean(smtp && env.SMTP_TLS_KEY_FILE && env.SMTP_TLS_CERT_FILE),
  }));

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info("Worker shutting down", { signal });
    state.ready = false;
    for (const timer of timers) clearInterval(timer);
    await heartbeat.stop();
    if (smtp) await closeSmtpServer(smtp);
    await runner.stop();
    await flushApiRequestCount();
    health.close();
    await closeDb();
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((error: unknown) => {
  logger.error("Worker failed to start", { error });
  process.exit(1);
});
