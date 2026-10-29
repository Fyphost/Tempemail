import { requireInbox } from "@/server/auth/request";
import { ok } from "@/server/http/respond";
import { apiRoute } from "@/server/http/route";
import { extendInbox, inboxLimits, serializeInbox } from "@/server/inboxes/service";

export const dynamic = "force-dynamic";

/** Extend the lifetime of the current inbox, within the plan's maximum lifetime. */
export const POST = apiRoute(async (request, _context, { settings }) => {
  const { inbox, domain } = await requireInbox(request, settings);
  const updated = await extendInbox(inbox);
  return ok({ inbox: serializeInbox(updated, domain, await inboxLimits(updated)) });
});
