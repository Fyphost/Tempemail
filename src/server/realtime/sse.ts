/** Serialise one Server-Sent Events frame. Data is JSON on a single line. */
export function formatSseEvent(event: string, data: unknown, id?: string): string {
  const lines: string[] = [];
  if (id) lines.push(`id: ${id.replace(/[\r\n]/g, "")}`);
  lines.push(`event: ${event.replace(/[\r\n]/g, "")}`);
  lines.push(`data: ${JSON.stringify(data)}`);
  return `${lines.join("\n")}\n\n`;
}

export const SSE_HEADERS: Record<string, string> = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
};
