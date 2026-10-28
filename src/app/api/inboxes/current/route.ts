import { clearInboxCookie, requireInbox } from "@/server/auth/request";
import { ok } from "@/server/http/respond";
import { apiRoute } from "@/server/http/route";
import { deleteInboxById, inboxLimits, serializeInbox } from "@/server/inboxes/service";

export const dynamic = "force-dynamic";

export const GET = apiRoute(async (request, _context, { settings }) => {
  const { inbox, domain } = await requireInbox(request, settings);
  return ok({ inbox: serializeInbox(inbox, domain, await inboxLimits(inbox)) });
});

/** Permanently delete the current inbox together with all of its messages. */
export const DELETE = apiRoute(async (request, _context, { settings }) => {
  const access = await requireInbox(request, settings, { allowExpired: true });
  await deleteInboxById(access.inbox.id, "deleted");
  const response = ok({ deleted: true });
  if (access.via === "cookie") clearInboxCookie(response);
  return response;
});
