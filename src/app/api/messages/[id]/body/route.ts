import { requireInbox } from "@/server/auth/request";
import { apiRoute, type IdParams } from "@/server/http/route";
import { emailDocumentCsp } from "@/server/mail/sanitize";
import { renderMessageDocument } from "@/server/messages/service";

export const dynamic = "force-dynamic";

/**
 * Sanitized HTML document for the sandboxed reader iframe. The response CSP
 * blocks scripts, forms, plugins and (by default) every remote request, and
 * applies its own sandbox even if the URL is opened directly.
 */
export const GET = apiRoute<IdParams>(async (request, { params }, { settings }) => {
  const { id } = await params;
  const { inbox } = await requireInbox(request, settings);
  const allowRemoteImages = request.nextUrl.searchParams.get("images") === "1";
  const document = await renderMessageDocument(inbox.id, id, { allowRemoteImages });
  return new Response(document, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": emailDocumentCsp(allowRemoteImages),
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "Cache-Control": "private, no-store, max-age=0",
      "Cross-Origin-Resource-Policy": "same-origin",
    },
  });
});
