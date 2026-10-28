/** Attachment safety policy: dangerous types and oversized files keep metadata only. */

const BLOCKED_CONTENT_TYPES = new Set([
  "application/x-msdownload",
  "application/x-msdos-program",
  "application/x-ms-installer",
  "application/x-msi",
  "application/vnd.microsoft.portable-executable",
  "application/x-dosexec",
  "application/x-executable",
  "application/x-elf",
  "application/x-mach-binary",
  "application/x-sh",
  "application/x-csh",
  "application/x-bat",
  "application/hta",
  "application/x-ms-shortcut",
  "application/java-archive",
  "application/x-java-archive",
  "application/vnd.android.package-archive",
  "application/x-apple-diskimage",
  "application/x-iso9660-image",
  "text/javascript",
  "application/javascript",
  "application/x-javascript",
  "text/vbscript",
  "application/x-powershell",
]);

export function sanitizeFilename(
  input: string | undefined | null,
  fallback = "attachment",
): string {
  const base = (input ?? "")
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, "")
    .replace(/[\\/]/g, "_")
    .replace(/^\.+/, "")
    .trim();
  const cleaned = base.length > 0 ? base : fallback;
  if (cleaned.length <= 180) return cleaned;
  const dot = cleaned.lastIndexOf(".");
  const ext = dot > 0 && cleaned.length - dot <= 12 ? cleaned.slice(dot) : "";
  return `${cleaned.slice(0, 180 - ext.length)}${ext}`;
}

export function fileExtensions(filename: string): string[] {
  const parts = filename.toLowerCase().split(".");
  return parts.length > 1 ? parts.slice(1).map((part) => part.trim()) : [];
}

export interface AttachmentDecision {
  blocked: boolean;
  reason: string | null;
}

export function evaluateAttachment(
  filename: string,
  contentType: string,
  sizeBytes: number,
  policy: { maxAttachmentBytes: number; blockedExtensions: readonly string[] },
): AttachmentDecision {
  const blockedExtensions = new Set(policy.blockedExtensions.map((ext) => ext.toLowerCase()));
  const extension = fileExtensions(filename).at(-1);
  if (extension && blockedExtensions.has(extension)) {
    return { blocked: true, reason: `Files of type .${extension} are blocked for safety.` };
  }
  if (BLOCKED_CONTENT_TYPES.has(contentType.toLowerCase().split(";")[0]!.trim())) {
    return { blocked: true, reason: "Executable or script content is blocked for safety." };
  }
  if (sizeBytes > policy.maxAttachmentBytes) {
    return { blocked: true, reason: "The file exceeds the attachment size limit." };
  }
  return { blocked: false, reason: null };
}

/** Content types that are safe to show inline in the browser (images only). */
export function isInlineSafeImage(contentType: string): boolean {
  return /^image\/(png|jpe?g|gif|webp|bmp|avif)$/i.test(contentType.split(";")[0]!.trim());
}
