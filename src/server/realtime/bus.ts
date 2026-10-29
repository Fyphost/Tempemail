import pg from "pg";

import { sslOption } from "@/server/db/client";
import { getEnv } from "@/server/env";
import { logger } from "@/server/logger";

import { EVENTS_CHANNEL, type BusEnvelope, type InboxEvent } from "./events";

export type BusListener = (event: InboxEvent | { type: "bus.reset" }) => void;

/**
 * One dedicated LISTEN connection per server process fans PostgreSQL
 * notifications out to in-memory subscribers (SSE streams). If the
 * connection drops, subscribers receive "bus.reset" so clients reconnect and
 * resynchronise instead of silently missing events.
 */
class RealtimeBus {
  private client: pg.Client | null = null;
  private connecting: Promise<void> | null = null;
  private readonly listeners = new Map<string, Set<BusListener>>();
  private reconnectTimer: NodeJS.Timeout | null = null;
  private retryDelayMs = 1_000;

  get subscriberCount(): number {
    let total = 0;
    for (const set of this.listeners.values()) total += set.size;
    return total;
  }

  countFor(inboxId: string): number {
    return this.listeners.get(inboxId)?.size ?? 0;
  }

  async subscribe(inboxId: string, listener: BusListener): Promise<() => void> {
    await this.ensureConnected();
    let set = this.listeners.get(inboxId);
    if (!set) {
      set = new Set();
      this.listeners.set(inboxId, set);
    }
    set.add(listener);
    return () => {
      const current = this.listeners.get(inboxId);
      if (!current) return;
      current.delete(listener);
      if (current.size === 0) this.listeners.delete(inboxId);
    };
  }

  private async ensureConnected(): Promise<void> {
    if (this.client) return;
    if (!this.connecting) {
      this.connecting = this.connect().finally(() => {
        this.connecting = null;
      });
    }
    await this.connecting;
  }

  private async connect(): Promise<void> {
    const env = getEnv();
    const client = new pg.Client({
      connectionString: env.DATABASE_URL,
      ssl: sslOption(env.DATABASE_SSL),
      application_name: "tempemail-realtime",
      keepAlive: true,
    });
    client.on("notification", (message) => this.dispatch(message.payload));
    client.on("error", (error) => {
      logger.warn("Realtime listener connection error", { error });
      this.handleDisconnect(client);
    });
    client.on("end", () => this.handleDisconnect(client));
    await client.connect();
    await client.query(`LISTEN ${EVENTS_CHANNEL}`);
    this.client = client;
    this.retryDelayMs = 1_000;
  }

  private dispatch(payload: string | undefined): void {
    if (!payload) return;
    let envelope: BusEnvelope;
    try {
      envelope = JSON.parse(payload) as BusEnvelope;
    } catch {
      return;
    }
    const set = this.listeners.get(envelope.inbox);
    if (!set) return;
    for (const listener of [...set]) {
      try {
        listener(envelope.event);
      } catch (error) {
        logger.warn("Realtime listener threw", { error });
      }
    }
  }

  private handleDisconnect(client: pg.Client): void {
    if (this.client !== client) return;
    this.client = null;
    client.removeAllListeners();
    client.end().catch(() => undefined);
    for (const set of this.listeners.values()) {
      for (const listener of [...set]) listener({ type: "bus.reset" });
    }
    if (this.listeners.size > 0 && !this.reconnectTimer) {
      this.reconnectTimer = setTimeout(() => {
        this.reconnectTimer = null;
        this.ensureConnected().catch((error: unknown) => {
          logger.warn("Realtime reconnect failed", { error });
          this.retryDelayMs = Math.min(this.retryDelayMs * 2, 30_000);
        });
      }, this.retryDelayMs);
      this.reconnectTimer.unref?.();
    }
  }

  async close(): Promise<void> {
    const client = this.client;
    this.client = null;
    this.listeners.clear();
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    if (client) {
      client.removeAllListeners();
      await client.end().catch(() => undefined);
    }
  }
}

const globals = globalThis as typeof globalThis & { __tempemailBus?: RealtimeBus };

export function getRealtimeBus(): RealtimeBus {
  globals.__tempemailBus ??= new RealtimeBus();
  return globals.__tempemailBus;
}

export async function closeRealtimeBus(): Promise<void> {
  const bus = globals.__tempemailBus;
  globals.__tempemailBus = undefined;
  if (bus) await bus.close();
}
