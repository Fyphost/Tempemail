import { z } from "zod";

import { currentInboxCookieToken, resolvePrincipal, setInboxCookie } from "@/server/auth/request";
import { errors } from "@/server/http/errors";
import { assertSameOrigin, parseJsonBody } from "@/server/http/request";
import { ok } from "@/server/http/respond";
import { apiRoute } from "@/server/http/route";
import {
  createInbox,
  findInboxByToken,
  inboxLimits,
  listUserInboxes,
  serializeInbox,
} from "@/server/inboxes/service";

export const dynamic = "force-dynamic";

const createSchema = z
  .object({
    domain: z.string().trim().min(3).max(253).optional(),
    ttlMinutes: z.number().int().min(5).max(129_600).optional(),
    replaceCurrent: z.boolean().optional(),
  })
  .strict();

/** Create a new temporary inbox and return its address and secret access token. */
export const POST = apiRoute(async (request, _context, { settings, ipHash }) => {
  assertSameOrigin(request);
  const body = await parseJsonBody(request, createSchema);
  const principal = await resolvePrincipal(request, settings);

  let replaceInboxId: string | null = null;
  if (body.replaceCurrent) {
    const cookieToken = currentInboxCookieToken(request);
    const current = cookieToken ? await findInboxByToken(cookieToken) : null;
    const ownerMatches = current && (current.inbox.userId ?? null) === (principal.user?.id ?? null);
    if (current && ownerMatches) replaceInboxId = current.inbox.id;
  }

  const created = await createInbox({
    principal: { userId: principal.user?.id ?? null, plan: principal.user?.plan ?? "free" },
    ipHash,
    domain: body.domain,
    ttlMinutes: body.ttlMinutes,
    replaceInboxId,
  });

  const response = ok(
    {
      inbox: serializeInbox(created.inbox, created.domain, created.limits),
      token: created.token,
    },
    { status: 201 },
  );
  if (principal.via !== "api_key") {
    setInboxCookie(response, created.token, created.inbox.maxExpiresAt);
  }
  return response;
});

/** Inboxes owned by the signed-in account or API key. */
export const GET = apiRoute(async (request, _context, { settings }) => {
  const principal = await resolvePrincipal(request, settings);
  if (!principal.user) throw errors.unauthorized("Sign in or use an API key to list your inboxes.");
  const rows = await listUserInboxes(principal.user.id);
  const inboxes = await Promise.all(
    rows.map(async ({ inbox, domain }) => serializeInbox(inbox, domain, await inboxLimits(inbox))),
  );
  return ok({ inboxes });
});
