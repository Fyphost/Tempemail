/** Public API shapes shared by the server serializers and browser code. */

export type PlanId = "free" | "premium";

export interface InboxView {
  id: string;
  address: string;
  domain: string;
  createdAt: string;
  expiresAt: string;
  maxExpiresAt: string;
  messageCount: number;
  plan: PlanId;
  owned: boolean;
  limits: {
    maxMessages: number;
    maxMessageSizeKb: number;
    extendMinutes: number;
    canExtend: boolean;
  };
}

export interface MessageSummaryView {
  id: string;
  from: { name: string; address: string };
  subject: string;
  preview: string;
  receivedAt: string;
  read: boolean;
  attachmentCount: number;
  sizeBytes: number;
}

export interface AttachmentView {
  id: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  inline: boolean;
  blocked: boolean;
  blockedReason: string | null;
}

export interface MessageDetailView extends MessageSummaryView {
  to: string | null;
  cc: string | null;
  replyTo: string | null;
  envelopeTo: string;
  date: string | null;
  text: string | null;
  html: string | null;
  hasHtml: boolean;
  hasRemoteContent: boolean;
  headers: [string, string][];
  attachments: AttachmentView[];
}

export interface MessagePage {
  messages: MessageSummaryView[];
  nextCursor: string | null;
  total: number;
  unread: number;
}

export interface DomainOption {
  name: string;
  premium: boolean;
}

export interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown };
}
