import { z } from "zod";

import { requireInbox } from "@/server/auth/request";
import { parseJsonBody } from "@/server/http/request";
import { ok } from "@/server/http/respond";
import { apiRoute, type IdParams } from "@/server/http/route";
import { deleteMessage, getMessageDetail, setMessageRead } from "@/server/messages/service";

export const dynamic = "force-dynamic";

/** Full message. Only messages that belong to the authorized inbox are visible. */
export const GET = apiRoute<IdParams>(async (request, { params }, { settings }) => {
  const { id } = await params;
  const { inbox } = await requireInbox(request, settings);
  const markRead = request.nextUrl.searchParams.get("markRead") !== "false";
  return ok({ message: await getMessageDetail(inbox.id, id, { markRead }) });
});

const patchSchema = z.object({ read: z.boolean() }).strict();

export const PATCH = apiRoute<IdParams>(async (request, { params }, { settings }) => {
  const { id } = await params;
  const { inbox } = await requireInbox(request, settings);
  const body = await parseJsonBody(request, patchSchema);
  await setMessageRead(inbox.id, id, body.read);
  return ok({ id, read: body.read });
});

export const DELETE = apiRoute<IdParams>(async (request, { params }, { settings }) => {
  const { id } = await params;
  const { inbox } = await requireInbox(request, settings);
  await deleteMessage(inbox.id, id);
  return ok({ deleted: true });
});
