"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createApiKey, revokeApiKey, type ApiKeyView } from "@/server/auth/api-keys";
import { inboxCookieName, secureCookieOptions } from "@/server/auth/cookies";
import { getSessionUser, requireUser } from "@/server/auth/session";
import { changePassword } from "@/server/auth/users";
import { errors } from "@/server/http/errors";
import { deleteOwnedInbox, issueTokenForOwnedInbox } from "@/server/inboxes/service";

import { runAction, type ActionResult } from "./result";

const publicId = z.string().regex(/^[a-z]{3}_[A-Za-z0-9]{10,40}$/);

/** Make one of the signed-in user's inboxes the current inbox of this browser. */
export async function openOwnedInboxAction(inboxId: string): Promise<ActionResult> {
  return runAction(async () => {
    const user = await getSessionUser();
    if (!user) throw errors.unauthorized("Sign in to switch between your addresses.");
    const id = publicId.parse(inboxId);
    const { token, inbox } = await issueTokenForOwnedInbox(user.id, id);
    (await cookies()).set(inboxCookieName(), token, secureCookieOptions(inbox.maxExpiresAt));
    return undefined;
  });
}

export async function deleteOwnedInboxAction(inboxId: string): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUser();
    await deleteOwnedInbox(user.id, publicId.parse(inboxId));
    revalidatePath("/account");
    return undefined;
  });
}

const keyName = z.string().trim().min(1, "Give the key a name.").max(80);

export async function createApiKeyAction(
  name: string,
): Promise<ActionResult<{ key: string; view: ApiKeyView }>> {
  return runAction(async () => {
    const user = await requireUser();
    const parsed = keyName.safeParse(name);
    if (!parsed.success)
      throw errors.badRequest(parsed.error.issues[0]?.message ?? "Invalid name.");
    const created = await createApiKey(user, parsed.data);
    revalidatePath("/account");
    return created;
  });
}

export async function revokeApiKeyAction(keyId: string): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUser();
    await revokeApiKey(user, publicId.parse(keyId));
    revalidatePath("/account");
    return undefined;
  });
}

const passwordSchema = z.object({
  current: z.string().min(1, "Enter your current password."),
  next: z.string().min(10, "Use at least 10 characters.").max(200),
});

export async function changePasswordAction(input: {
  current: string;
  next: string;
}): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUser();
    const parsed = passwordSchema.safeParse(input);
    if (!parsed.success)
      throw errors.badRequest(parsed.error.issues[0]?.message ?? "Invalid input.");
    await changePassword(user.id, parsed.data.current, parsed.data.next);
    return undefined;
  });
}
