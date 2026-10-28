import type {
  ApiErrorBody,
  DomainOption,
  InboxView,
  MessageDetailView,
  MessagePage,
} from "./types";

export class ApiClientError extends Error {
  readonly status: number;
  readonly code: string;
  readonly retryAfterSeconds: number | null;

  constructor(
    status: number,
    code: string,
    message: string,
    retryAfterSeconds: number | null = null,
  ) {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      credentials: "same-origin",
      cache: "no-store",
      headers: {
        Accept: "application/json",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
    });
  } catch {
    throw new ApiClientError(
      0,
      "network_error",
      "Could not reach the server. Check your connection and try again.",
    );
  }
  const body = (await response.json().catch(() => null)) as
    ({ data: T } & Partial<ApiErrorBody>) | null;
  if (!response.ok) {
    const retryAfter = Number(response.headers.get("retry-after"));
    throw new ApiClientError(
      response.status,
      body?.error?.code ?? "http_error",
      body?.error?.message ?? `Request failed (${response.status}).`,
      Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : null,
    );
  }
  return (body as { data: T }).data;
}

export const api = {
  domains: () => request<{ domains: DomainOption[]; defaultDomain: string | null }>("/api/domains"),
  currentInbox: () => request<{ inbox: InboxView }>("/api/inboxes/current"),
  createInbox: (options: { domain?: string; ttlMinutes?: number; replaceCurrent?: boolean }) =>
    request<{ inbox: InboxView; token: string }>("/api/inboxes", {
      method: "POST",
      body: JSON.stringify(options),
    }),
  deleteInbox: () => request<{ deleted: true }>("/api/inboxes/current", { method: "DELETE" }),
  extendInbox: () =>
    request<{ inbox: InboxView }>("/api/inboxes/current/extend", { method: "POST" }),
  listMessages: (params: { q?: string; cursor?: string; limit?: number } = {}) => {
    const search = new URLSearchParams();
    if (params.q) search.set("q", params.q);
    if (params.cursor) search.set("cursor", params.cursor);
    search.set("limit", String(params.limit ?? 50));
    return request<MessagePage>(`/api/inboxes/current/messages?${search.toString()}`);
  },
  getMessage: (id: string) =>
    request<{ message: MessageDetailView }>(`/api/messages/${encodeURIComponent(id)}`),
  setRead: (id: string, read: boolean) =>
    request<{ id: string; read: boolean }>(`/api/messages/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify({ read }),
    }),
  deleteMessage: (id: string) =>
    request<{ deleted: true }>(`/api/messages/${encodeURIComponent(id)}`, { method: "DELETE" }),
};

export function messageBodyUrl(id: string, allowRemoteImages: boolean): string {
  return `/api/messages/${encodeURIComponent(id)}/body${allowRemoteImages ? "?images=1" : ""}`;
}

export function attachmentUrl(messageId: string, attachmentId: string, inline = false): string {
  return `/api/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}${inline ? "?inline=1" : ""}`;
}
