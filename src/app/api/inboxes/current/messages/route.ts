import { z } from "zod";

import { requireInbox } from "@/server/auth/request";
import { parseQuery } from "@/server/http/request";
import { ok } from "@/server/http/respond";
import { apiRoute } from "@/server/http/route";
import { listMessages } from "@/server/messages/service";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().max(200).optional(),
  q: z.string().trim().max(200).optional(),
  unread: z.enum(["true", "false"]).optional(),
});

export const GET = apiRoute(async (request, _context, { settings }) => {
  const { inbox } = await requireInbox(request, settings);
  const query = parseQuery(request, querySchema);
  const result = await listMessages(inbox.id, {
    limit: query.limit,
    cursor: query.cursor,
    query: query.q || undefined,
    unreadOnly: query.unread === "true",
  });
  return ok(result);
});
