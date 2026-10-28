import { z } from "zod";

/** Runtime settings schema and defaults (shared by the server and the admin settings form). */

const int = (min: number, max: number) => z.number().int().min(min).max(max);

export const planLimitsSchema = z.object({
  /** Default lifetime of a new inbox. */
  inboxTtlMinutes: int(5, 43_200),
  /** Hard cap on lifetime including extensions, measured from creation. */
  maxLifetimeMinutes: int(5, 129_600),
  /** Minutes added per extension; 0 disables extensions. */
  extendMinutes: int(0, 43_200),
  maxConcurrentInboxes: int(1, 1_000),
  inboxCreatesPerHour: int(1, 100_000),
  maxMessagesPerInbox: int(1, 100_000),
  maxMessageSizeKb: int(64, 51_200),
  /** Allows choosing a lifetime (up to maxLifetimeMinutes) when creating an inbox. */
  customRetention: z.boolean(),
  /** Allows creating API keys. */
  apiKeys: z.boolean(),
});
export type PlanLimits = z.infer<typeof planLimitsSchema>;

const DEFAULT_BLOCKED_EXTENSIONS = [
  "exe",
  "scr",
  "bat",
  "cmd",
  "com",
  "pif",
  "cpl",
  "msi",
  "msp",
  "dll",
  "sys",
  "vbs",
  "vbe",
  "js",
  "jse",
  "wsf",
  "wsh",
  "ps1",
  "psm1",
  "jar",
  "hta",
  "lnk",
  "reg",
  "app",
  "apk",
  "dmg",
  "iso",
  "img",
  "vhd",
  "vhdx",
  "sh",
  "scf",
  "inf",
  "appx",
  "msix",
  "chm",
  "url",
];

export const settingsSchema = z.object({
  plans: z.object({
    free: planLimitsSchema,
    premium: planLimitsSchema,
  }),
  premiumEnabled: z.boolean(),
  registrationEnabled: z.boolean(),
  rateLimits: z.object({
    /** Per client IP, all REST endpoints. */
    apiRequestsPerMinute: int(10, 100_000),
    /** Inbound messages accepted per inbox per minute (flood protection). */
    inboundPerInboxPerMinute: int(1, 10_000),
    /** SMTP connections per remote IP per minute. */
    smtpConnectionsPerMinute: int(1, 100_000),
    loginAttemptsPer15Minutes: int(3, 1_000),
    contactRequestsPerHour: int(1, 1_000),
    sseConnectionsPerInbox: int(1, 100),
  }),
  attachments: z.object({
    maxAttachmentSizeKb: int(16, 51_200),
    blockedExtensions: z.array(z.string().regex(/^[a-z0-9]{1,10}$/)).max(200),
  }),
  api: z.object({
    /** Master switch for programmatic (Bearer token) access. */
    enabled: z.boolean(),
    keysEnabled: z.boolean(),
  }),
  retention: z.object({
    /** Processed ingestion records are kept this long for duplicate detection. */
    completedJobsHours: int(1, 720),
    failedJobsDays: int(1, 90),
    auditLogDays: int(7, 3650),
    webhookFailureDays: int(1, 365),
    contactRequestsDays: int(7, 3650),
  }),
});
export type SystemSettings = z.infer<typeof settingsSchema>;

export const DEFAULT_SETTINGS: SystemSettings = {
  plans: {
    free: {
      inboxTtlMinutes: 60,
      maxLifetimeMinutes: 360,
      extendMinutes: 60,
      maxConcurrentInboxes: 1,
      inboxCreatesPerHour: 15,
      maxMessagesPerInbox: 100,
      maxMessageSizeKb: 10_240,
      customRetention: false,
      apiKeys: false,
    },
    premium: {
      inboxTtlMinutes: 1_440,
      maxLifetimeMinutes: 10_080,
      extendMinutes: 1_440,
      maxConcurrentInboxes: 25,
      inboxCreatesPerHour: 250,
      maxMessagesPerInbox: 1_000,
      maxMessageSizeKb: 25_600,
      customRetention: true,
      apiKeys: true,
    },
  },
  premiumEnabled: false,
  registrationEnabled: false,
  rateLimits: {
    apiRequestsPerMinute: 240,
    inboundPerInboxPerMinute: 30,
    smtpConnectionsPerMinute: 60,
    loginAttemptsPer15Minutes: 10,
    contactRequestsPerHour: 5,
    sseConnectionsPerInbox: 5,
  },
  attachments: {
    maxAttachmentSizeKb: 10_240,
    blockedExtensions: DEFAULT_BLOCKED_EXTENSIONS,
  },
  api: {
    enabled: true,
    keysEnabled: true,
  },
  retention: {
    completedJobsHours: 72,
    failedJobsDays: 7,
    auditLogDays: 90,
    webhookFailureDays: 14,
    contactRequestsDays: 180,
  },
};
