"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  adminDeleteInbox,
  blockNetwork,
  setContactRequestStatus,
  unblockNetwork,
} from "@/server/admin/service";
import type { AuditActor } from "@/server/audit";
import { actorFor, getSessionUser } from "@/server/auth/session";
import { createUser, setPasswordByAdmin, updateUserByAdmin } from "@/server/auth/users";
import {
  checkDomainDns,
  createDomain,
  deleteDomain,
  rotateProbeAddress,
  updateDomain,
} from "@/server/domains/service";
import { errors } from "@/server/http/errors";
import { retryIngestJob } from "@/server/jobs/queue";
import { saveSettings, settingsSchema, type SystemSettings } from "@/server/settings";

import { runAction, type ActionResult } from "./result";

/** Every admin action re-checks the session and role; never rely on the page gate alone. */
async function requireAdminActor(): Promise<AuditActor> {
  const user = await getSessionUser();
  if (!user || user.role !== "admin") throw errors.forbidden("Administrator access is required.");
  return actorFor(user);
}

const uuid = z.uuid();
const hostList = z
  .string()
  .max(1_000)
  .transform((value) =>
    value
      .split(/[\s,]+/)
      .map((host) => host.trim().toLowerCase())
      .filter(Boolean),
  )
  .pipe(
    z
      .array(
        z
          .string()
          .regex(
            /^(\*\.)?[a-z0-9.-]+$/,
            "Use host names such as mx.example.com or *.mx.cloudflare.net",
          ),
      )
      .max(10),
  );

/* Domains */

const domainInput = z.object({
  name: z.string().trim().min(3).max(253),
  visibility: z.enum(["public", "premium"]),
  expectedMx: hostList,
  defaultTtlMinutes: z.number().int().min(5).max(129_600).nullable(),
});

export async function createDomainAction(
  input: z.input<typeof domainInput>,
): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireAdminActor();
    const data = domainInput.parse(input);
    const domain = await createDomain(data, actor);
    await checkDomainDns(domain.id, actor).catch(() => undefined);
    revalidatePath("/admin/domains");
    return undefined;
  });
}

const domainPatch = z.object({
  id: uuid,
  isEnabled: z.boolean().optional(),
  visibility: z.enum(["public", "premium"]).optional(),
  expectedMx: hostList.optional(),
  defaultTtlMinutes: z.number().int().min(5).max(129_600).nullable().optional(),
});

export async function updateDomainAction(
  input: z.input<typeof domainPatch>,
): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireAdminActor();
    const { id, ...patch } = domainPatch.parse(input);
    await updateDomain(id, patch, actor);
    revalidatePath("/admin/domains");
    return undefined;
  });
}

export async function checkDomainAction(id: string): Promise<ActionResult<{ mxStatus: string }>> {
  return runAction(async () => {
    const actor = await requireAdminActor();
    const domain = await checkDomainDns(uuid.parse(id), actor);
    revalidatePath("/admin/domains");
    return { mxStatus: domain.mxStatus };
  });
}

export async function rotateProbeAction(id: string): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireAdminActor();
    await rotateProbeAddress(uuid.parse(id), actor);
    revalidatePath("/admin/domains");
    return undefined;
  });
}

export async function deleteDomainAction(id: string): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireAdminActor();
    await deleteDomain(uuid.parse(id), actor);
    revalidatePath("/admin/domains");
    return undefined;
  });
}

/* Inboxes and abuse */

export async function deleteInboxAction(id: string): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireAdminActor();
    await adminDeleteInbox(uuid.parse(id), actor);
    revalidatePath("/admin/inboxes");
    return undefined;
  });
}

const blockInput = z.object({
  ip: z.string().trim().max(64).optional(),
  ipHash: z
    .string()
    .regex(/^[0-9a-f]{32}$/)
    .optional(),
  reason: z.string().trim().min(2, "Give a reason.").max(300),
  hours: z
    .number()
    .int()
    .min(1)
    .max(24 * 365)
    .nullable(),
});

export async function blockNetworkAction(input: z.input<typeof blockInput>): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireAdminActor();
    const parsed = blockInput.safeParse(input);
    if (!parsed.success)
      throw errors.badRequest(parsed.error.issues[0]?.message ?? "Invalid input.");
    await blockNetwork(parsed.data, actor);
    revalidatePath("/admin/abuse");
    revalidatePath("/admin/inboxes");
    return undefined;
  });
}

export async function unblockNetworkAction(id: string): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireAdminActor();
    await unblockNetwork(uuid.parse(id), actor);
    revalidatePath("/admin/abuse");
    return undefined;
  });
}

/* Processing */

export async function retryJobAction(id: string): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireAdminActor();
    await retryIngestJob(uuid.parse(id), actor);
    revalidatePath("/admin/processing");
    return undefined;
  });
}

/* Users */

const userPatch = z.object({
  id: uuid,
  role: z.enum(["user", "admin"]).optional(),
  plan: z.enum(["free", "premium"]).optional(),
  status: z.enum(["active", "disabled"]).optional(),
});

export async function updateUserAction(input: z.input<typeof userPatch>): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireAdminActor();
    const { id, ...patch } = userPatch.parse(input);
    await updateUserByAdmin(id, patch, actor);
    revalidatePath("/admin/users");
    return undefined;
  });
}

const newUser = z.object({
  email: z.email("Enter a valid email address."),
  password: z.string().min(10, "Use at least 10 characters.").max(200),
  role: z.enum(["user", "admin"]),
  plan: z.enum(["free", "premium"]),
});

export async function createUserAction(input: z.input<typeof newUser>): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireAdminActor();
    const parsed = newUser.safeParse(input);
    if (!parsed.success)
      throw errors.badRequest(parsed.error.issues[0]?.message ?? "Invalid input.");
    await createUser(parsed.data, actor);
    revalidatePath("/admin/users");
    return undefined;
  });
}

const passwordReset = z.object({
  id: uuid,
  password: z.string().min(10, "Use at least 10 characters.").max(200),
});

export async function resetUserPasswordAction(
  input: z.input<typeof passwordReset>,
): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireAdminActor();
    const parsed = passwordReset.safeParse(input);
    if (!parsed.success)
      throw errors.badRequest(parsed.error.issues[0]?.message ?? "Invalid input.");
    await setPasswordByAdmin(parsed.data.id, parsed.data.password, actor);
    revalidatePath("/admin/users");
    return undefined;
  });
}

/* Settings */

export async function saveSettingsAction(input: SystemSettings): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireAdminActor();
    const parsed = settingsSchema.safeParse(input);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw errors.badRequest(
        issue ? `${issue.path.join(".")}: ${issue.message}` : "Invalid settings.",
      );
    }
    try {
      await saveSettings(parsed.data, actor.userId);
    } catch (error) {
      throw errors.badRequest(error instanceof Error ? error.message : "Invalid settings.");
    }
    const { writeAudit } = await import("@/server/audit");
    await writeAudit(actor, "settings.updated", { type: "settings", id: "system" });
    revalidatePath("/admin/settings");
    return undefined;
  });
}

/* Contact requests */

export async function setContactStatusAction(
  id: string,
  status: "open" | "closed",
): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireAdminActor();
    await setContactRequestStatus(uuid.parse(id), z.enum(["open", "closed"]).parse(status), actor);
    revalidatePath("/admin/messages");
    return undefined;
  });
}
