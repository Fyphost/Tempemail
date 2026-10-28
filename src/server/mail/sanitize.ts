import sanitizeHtml from "sanitize-html";

/**
 * Email HTML handling, in two passes:
 *
 * 1. `sanitizeEmailHtml` runs at ingestion. It applies a strict allowlist
 *    (no scripts, forms, frames, SVG, embeds, event handlers or unsafe URL
 *    schemes) and records whether the message references remote content.
 * 2. `renderEmailHtml` runs when the message is displayed. It re-applies the
 *    same allowlist (defence in depth), routes links through the /link
 *    interstitial, resolves inline cid: images and strips remote images
 *    unless the reader explicitly allowed them.
 *
 * The rendered document is additionally served with a restrictive
 * Content-Security-Policy and displayed in a sandboxed iframe without
 * allow-scripts or allow-same-origin.
 */

const ALLOWED_TAGS = [
  "a",
  "abbr",
  "address",
  "article",
  "aside",
  "b",
  "bdi",
  "bdo",
  "big",
  "blockquote",
  "br",
  "caption",
  "center",
  "cite",
  "code",
  "col",
  "colgroup",
  "dd",
  "del",
  "details",
  "dfn",
  "div",
  "dl",
  "dt",
  "em",
  "figcaption",
  "figure",
  "font",
  "footer",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "header",
  "hr",
  "i",
  "img",
  "ins",
  "kbd",
  "li",
  "main",
  "mark",
  "nav",
  "ol",
  "p",
  "pre",
  "q",
  "rp",
  "rt",
  "ruby",
  "s",
  "samp",
  "section",
  "small",
  "span",
  "strike",
  "strong",
  "style",
  "sub",
  "summary",
  "sup",
  "table",
  "tbody",
  "td",
  "tfoot",
  "th",
  "thead",
  "time",
  "tr",
  "tt",
  "u",
  "ul",
  "var",
  "wbr",
];

const GLOBAL_ATTRIBUTES = [
  "style",
  "class",
  "id",
  "dir",
  "lang",
  "title",
  "align",
  "valign",
  "width",
  "height",
  "bgcolor",
  "color",
  "border",
  "role",
  "aria-*",
];

const ALLOWED_ATTRIBUTES: sanitizeHtml.IOptions["allowedAttributes"] = {
  "*": GLOBAL_ATTRIBUTES,
  a: ["href", "name", "target", "rel"],
  img: ["src", "alt", "width", "height", "referrerpolicy", "loading"],
  table: ["cellpadding", "cellspacing", "summary", "frame", "rules"],
  td: ["colspan", "rowspan", "headers", "scope", "nowrap"],
  th: ["colspan", "rowspan", "headers", "scope", "nowrap", "abbr"],
  col: ["span"],
  colgroup: ["span"],
  font: ["face", "size", "color"],
  ol: ["start", "type", "reversed"],
  ul: ["type"],
  li: ["value"],
  time: ["datetime"],
  blockquote: ["cite"],
  q: ["cite"],
  del: ["cite", "datetime"],
  ins: ["cite", "datetime"],
  details: ["open"],
};

const DATA_IMAGE = /^data:image\/(png|jpe?g|gif|webp|bmp|avif|svg\+xml);base64,[a-z0-9+/=\s]+$/i;
const REMOTE_URL = /^(https?:)?\/\//i;
const CSS_REMOTE_URL = /url\(\s*['"]?\s*(https?:)?\/\//i;
// sanitize-html normalises allowed <style> elements, and their raw-text
// content can never contain "</style", so this pattern is reliable on its output.
const STYLE_BLOCK = /<style\b([^>]*)>([\s\S]*?)<\/style>/gi;

function baseOptions(): sanitizeHtml.IOptions {
  return {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: ALLOWED_ATTRIBUTES,
    allowedSchemes: ["http", "https", "mailto"],
    allowedSchemesByTag: { img: ["http", "https", "cid", "data"] },
    allowedSchemesAppliedToAttributes: ["href", "src", "cite"],
    allowProtocolRelative: false,
    // Text inside these tags is dropped together with the tag.
    nonTextTags: ["script", "noscript", "textarea", "option", "title", "template", "xml", "xmp"],
    // <style> is kept for email layouts; its content is cleaned by
    // cleanStyleBlocks() because sanitize-html passes it through verbatim.
    allowVulnerableTags: true,
    disallowedTagsMode: "discard",
    parser: { lowerCaseTags: true, lowerCaseAttributeNames: true },
  };
}

/**
 * Clean CSS inside <style> elements: drop @import, neutralise legacy
 * script-capable CSS (expression(), -moz-binding, behavior) and escape "<"
 * so the stylesheet can never be re-parsed as markup (mutation XSS).
 */
export function cleanCss(css: string): string {
  return css
    .replace(/@import[^;]*;?/gi, "")
    .replace(/expression\s*\(/gi, "removed(")
    .replace(/-moz-binding/gi, "-removed")
    .replace(/behavior\s*:/gi, "removed:")
    .replace(/</g, "\\3c ");
}

/** Inline style attributes: strip script-capable or legacy constructs. */
export function cleanInlineCss(css: string): string {
  return css
    .replace(/(javascript|vbscript)\s*:/gi, "removed:")
    .replace(/expression\s*\(/gi, "removed(")
    .replace(/-moz-binding/gi, "-removed")
    .replace(/behavior\s*:/gi, "removed:");
}

function withCleanStyle(attribs: sanitizeHtml.Attributes): sanitizeHtml.Attributes {
  return attribs.style ? { ...attribs, style: cleanInlineCss(attribs.style) } : attribs;
}

function cleanStyleBlocks(html: string, onRemote?: () => void): string {
  return html.replace(STYLE_BLOCK, (_match, attributes: string, css: string) => {
    if (onRemote && CSS_REMOTE_URL.test(css)) onRemote();
    return `<style${attributes}>${cleanCss(css)}</style>`;
  });
}

export interface SanitizedHtml {
  html: string;
  hasRemoteContent: boolean;
}

/** Ingestion-time sanitization. The result is what gets stored. */
export function sanitizeEmailHtml(input: string): SanitizedHtml {
  let hasRemoteContent = false;
  const options = baseOptions();
  options.transformTags = {
    img: (tagName, attribs) => {
      const src = (attribs.src ?? "").trim();
      const next = { ...attribs };
      if (REMOTE_URL.test(src)) {
        hasRemoteContent = true;
      } else if (src.toLowerCase().startsWith("data:") && !DATA_IMAGE.test(src)) {
        delete next.src;
      }
      return { tagName, attribs: next };
    },
    "*": (tagName, attribs) => {
      if (attribs.style && CSS_REMOTE_URL.test(attribs.style)) hasRemoteContent = true;
      return { tagName, attribs: withCleanStyle(attribs) };
    },
  };
  const html = cleanStyleBlocks(sanitizeHtml(input, options), () => {
    hasRemoteContent = true;
  }).trim();
  return { html, hasRemoteContent };
}

export interface RenderOptions {
  /** Load remote images (explicit reader consent). */
  allowRemoteImages: boolean;
  /** Content-ID (without angle brackets, lowercase) -> data: URI. */
  inlineImages: Map<string, string>;
  /** Base path of the outbound link interstitial. */
  linkBase?: string;
}

/** Display-time rendering. Re-sanitizes and rewrites links and images. */
export function renderEmailHtml(storedHtml: string, render: RenderOptions): string {
  const linkBase = render.linkBase ?? "/link";
  const options = baseOptions();
  options.transformTags = {
    a: (tagName, attribs) => {
      const href = (attribs.href ?? "").trim();
      const next: Record<string, string> = { ...attribs };
      delete next.target;
      delete next.rel;
      if (/^https?:\/\//i.test(href)) {
        next.href = `${linkBase}?u=${encodeURIComponent(href)}`;
        next.target = "_blank";
        next.rel = "noopener noreferrer nofollow";
      } else if (/^mailto:/i.test(href)) {
        next.target = "_blank";
        next.rel = "noopener noreferrer";
      } else {
        delete next.href;
      }
      return { tagName, attribs: withCleanStyle(next) };
    },
    img: (tagName, attribs) => {
      const src = (attribs.src ?? "").trim();
      const next: Record<string, string> = { ...withCleanStyle(attribs) };
      delete next.referrerpolicy;
      delete next.loading;
      if (/^cid:/i.test(src)) {
        const cid = src.slice(4).replace(/^<|>$/g, "").trim().toLowerCase();
        const dataUri = render.inlineImages.get(cid);
        if (dataUri) next.src = dataUri;
        else delete next.src;
      } else if (REMOTE_URL.test(src)) {
        if (render.allowRemoteImages && /^https?:\/\//i.test(src)) {
          next.referrerpolicy = "no-referrer";
          next.loading = "lazy";
        } else {
          delete next.src;
        }
      } else if (!DATA_IMAGE.test(src)) {
        delete next.src;
      }
      return { tagName, attribs: next };
    },
    "*": (tagName, attribs) => ({ tagName, attribs: withCleanStyle(attribs) }),
  };
  return cleanStyleBlocks(sanitizeHtml(storedHtml, options));
}

/** Wrap rendered body HTML in a minimal standalone document for the iframe. */
export function buildEmailDocument(bodyHtml: string): string {
  return [
    "<!doctype html>",
    '<html><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<meta name="referrer" content="no-referrer">',
    "<style>",
    "html,body{margin:0;padding:0;background:#ffffff;}",
    "body{padding:20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.5;color:#0f172a;word-wrap:break-word;overflow-wrap:anywhere;}",
    "img{max-width:100%;height:auto;}",
    "table{max-width:100%;}",
    "a{color:#2563eb;}",
    "pre{white-space:pre-wrap;}",
    "</style></head><body>",
    bodyHtml,
    "</body></html>",
  ].join("");
}

/**
 * Content-Security-Policy for the rendered email document. Scripts, forms,
 * plugins, frames and network access are denied; images are limited to
 * inline data unless the reader opted in to remote images.
 */
export function emailDocumentCsp(allowRemoteImages: boolean): string {
  const img = allowRemoteImages ? "img-src data: https: http:" : "img-src data:";
  return [
    "default-src 'none'",
    "style-src 'unsafe-inline'",
    img,
    "font-src data:",
    "media-src 'none'",
    "script-src 'none'",
    "object-src 'none'",
    "frame-src 'none'",
    "form-action 'none'",
    "base-uri 'none'",
    "frame-ancestors 'self'",
    "sandbox allow-popups allow-popups-to-escape-sandbox",
  ].join("; ");
}

/** Collapse whitespace for list previews. */
export function makePreview(text: string | undefined | null, max = 180): string {
  if (!text) return "";
  const collapsed = text
    .replace(/\[(cid|image):[^\]]*\]/gi, " ")
    .replace(/https?:\/\/\S+/g, (url) => (url.length > 40 ? `${url.slice(0, 37)}…` : url))
    .replace(/\s+/g, " ")
    .trim();
  return collapsed.length > max ? `${collapsed.slice(0, max - 1).trimEnd()}…` : collapsed;
}
