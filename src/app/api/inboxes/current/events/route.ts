import { requireInbox } from "@/server/auth/request";
import { errors } from "@/server/http/errors";
import { apiRoute } from "@/server/http/route";
import { getRealtimeBus } from "@/server/realtime/bus";
import { formatSseEvent, SSE_HEADERS } from "@/server/realtime/sse";

export const dynamic = "force-dynamic";

const HEARTBEAT_MS = 20_000;
/** Streams are recycled periodically; EventSource reconnects transparently. */
const MAX_STREAM_MS = 10 * 60_000;

/**
 * Server-Sent Events for the current inbox: message.received,
 * message.deleted, inbox.updated and inbox.deleted.
 */
export const GET = apiRoute(
  async (request, _context, { settings }) => {
    const access = await requireInbox(request, settings);
    const bus = getRealtimeBus();
    if (bus.countFor(access.inbox.id) >= settings.rateLimits.sseConnectionsPerInbox) {
      throw errors.rateLimited(30, "Too many live connections are open for this inbox.");
    }

    const encoder = new TextEncoder();
    let stop: () => void = () => undefined;

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        let closed = false;
        let unsubscribe: (() => void) | null = null;
        const timers: { heartbeat?: NodeJS.Timeout; lifetime?: NodeJS.Timeout } = {};

        const close = () => {
          if (closed) return;
          closed = true;
          clearInterval(timers.heartbeat);
          clearTimeout(timers.lifetime);
          unsubscribe?.();
          try {
            controller.close();
          } catch {
            // already closed by the runtime
          }
        };
        stop = close;

        const send = (chunk: string) => {
          if (closed) return;
          try {
            controller.enqueue(encoder.encode(chunk));
          } catch {
            close();
          }
        };

        request.signal.addEventListener("abort", close);
        send("retry: 5000\n\n");

        try {
          unsubscribe = await bus.subscribe(access.inbox.id, (event) => {
            if (event.type === "bus.reset") {
              send(formatSseEvent("reconnect", {}));
              close();
              return;
            }
            send(formatSseEvent(event.type, event));
            if (event.type === "inbox.deleted") close();
          });
        } catch {
          send(formatSseEvent("reconnect", {}));
          close();
          return;
        }

        send(
          formatSseEvent("ready", {
            inboxId: access.inbox.publicId,
            expiresAt: access.inbox.expiresAt.toISOString(),
          }),
        );

        timers.heartbeat = setInterval(() => send(`: ping\n\n`), HEARTBEAT_MS);
        timers.lifetime = setTimeout(() => {
          send(formatSseEvent("reconnect", {}));
          close();
        }, MAX_STREAM_MS);
      },
      cancel() {
        stop();
      },
    });

    return new Response(stream, { headers: SSE_HEADERS });
  },
  { skipMetrics: true },
);
