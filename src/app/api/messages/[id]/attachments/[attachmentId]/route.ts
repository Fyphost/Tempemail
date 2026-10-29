import { requireInbox } from "@/server/auth/request";
import { apiRoute } from "@/server/http/route";
import { isInlineSafeImage } from "@/server/mail/attachments";
import { getAttachmentContent } from "@/server/messages/service";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string; attachmentId: string }> };

function contentDisposition(type: "inline" | "attachment", filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `${type}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

/**
 * Attachment download. Files are always served as opaque downloads so that
 * HTML/SVG attachments can never execute on this origin; only plain raster
 * images may be displayed inline (?inline=1).
 */
export const GET = apiRoute<Params>(async (request, { params }, { settings }) => {
  const { id, attachmentId } = await params;
  const { inbox } = await requireInbox(request, settings);
  const file = await getAttachmentContent(inbox.id, id, attachmentId);
  const inline =
    request.nextUrl.searchParams.get("inline") === "1" && isInlineSafeImage(file.contentType);
  return new Response(new Uint8Array(file.content!), {
    headers: {
      "Content-Type": inline ? file.contentType : "application/octet-stream",
      "Content-Length": String(file.content!.length),
      "Content-Disposition": contentDisposition(inline ? "inline" : "attachment", file.filename),
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; sandbox",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store, max-age=0",
      "Cross-Origin-Resource-Policy": "same-origin",
    },
  });
});
