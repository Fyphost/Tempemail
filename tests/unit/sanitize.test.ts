import { describe, expect, it } from "vitest";

import {
  emailDocumentCsp,
  makePreview,
  renderEmailHtml,
  sanitizeEmailHtml,
} from "@/server/mail/sanitize";

const render = (
  html: string,
  allowRemoteImages = false,
  inlineImages = new Map<string, string>(),
) => renderEmailHtml(sanitizeEmailHtml(html).html, { allowRemoteImages, inlineImages });

describe("sanitizeEmailHtml", () => {
  const vectors: [string, string][] = [
    ["script tag", "<script>alert(1)</script><p>ok</p>"],
    ["event handler", '<img src="x" onerror="alert(1)"><p onclick="alert(1)">ok</p>'],
    ["javascript href", '<a href="javascript:alert(1)">x</a>'],
    ["encoded javascript href", '<a href="jav&#x09;ascript:alert(1)">x</a>'],
    [
      "data html href",
      '<a href="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">x</a>',
    ],
    ["vbscript", '<a href="vbscript:msgbox(1)">x</a>'],
    ["iframe", '<iframe src="https://evil.example"></iframe>'],
    ["object/embed", '<object data="x.swf"></object><embed src="x.swf">'],
    ["svg", '<svg onload="alert(1)"><script>alert(1)</script></svg>'],
    ["math", "<math><mtext><table><mglyph><style><img src=x onerror=alert(1)>"],
    [
      "form",
      '<form action="https://evil.example"><input name="password"><button>Go</button></form>',
    ],
    ["meta refresh", '<meta http-equiv="refresh" content="0;url=https://evil.example">'],
    ["base tag", '<base href="https://evil.example/">'],
    ["link stylesheet", '<link rel="stylesheet" href="https://evil.example/x.css">'],
    ["srcdoc", '<iframe srcdoc="<script>alert(1)</script>"></iframe>'],
    ["template", "<template><script>alert(1)</script></template>"],
    [
      "noscript mutation",
      '<noscript><p title="</noscript><img src=x onerror=alert(1)>"></noscript>',
    ],
  ];

  it.each(vectors)("neutralises %s", (_name, html) => {
    const out = render(html);
    expect(out).not.toMatch(/<script/i);
    // Event handler attributes inside real tags (text inside <style> is inert CSS).
    expect(out).not.toMatch(/<[a-z][^>]*\son\w+\s*=/i);
    expect(out).not.toMatch(/(href|src)="?\s*(javascript|vbscript|data:text\/html)/i);
    expect(out).not.toMatch(
      /<(iframe|object|embed|svg|math|form|input|button|meta|base|link|template|img[^>]*src=x)\b/i,
    );
    // No raw "<" may survive inside a stylesheet (prevents re-parse breakouts).
    for (const [, css] of out.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)) {
      expect(css).not.toContain("<");
    }
  });

  it("neutralises legacy script-capable CSS", () => {
    const out = sanitizeEmailHtml(
      "<style>a{width:expression(alert(1));-moz-binding:url(x.xml#x);behavior:url(x.htc)}</style>",
    ).html;
    expect(out).not.toMatch(/expression\(|-moz-binding|behavior:/i);
    const inline = render(
      '<p style="background:url(javascript:alert(1));width:expression(1)">s</p><a style="x:vbscript:1" href="https://a.example">a</a>',
    );
    expect(inline).not.toMatch(/javascript:|vbscript:|expression\(/i);
  });

  it("keeps ordinary email formatting", () => {
    const html =
      '<table width="100%" cellpadding="0"><tr><td style="color:#333;padding:8px" align="center"><h1>Hi</h1><p>Welcome <strong>friend</strong></p></td></tr></table>';
    const out = sanitizeEmailHtml(html).html;
    expect(out).toContain('<table width="100%" cellpadding="0">');
    expect(out).toContain('style="color:#333;padding:8px"');
    expect(out).toContain("<strong>friend</strong>");
  });

  it("drops <title> text and CSS @import, keeps <style>", () => {
    const out = sanitizeEmailHtml(
      '<html><head><title>Secret title</title><style>@import url("https://evil.example/a.css"); .x{color:red}</style></head><body><p class="x">Body</p></body></html>',
    ).html;
    expect(out).not.toContain("Secret title");
    expect(out).not.toContain("@import");
    expect(out).toContain(".x{color:red}");
    expect(out).toContain('<p class="x">Body</p>');
  });

  it("detects remote content in images and CSS", () => {
    expect(sanitizeEmailHtml('<img src="https://t.example/p.gif">').hasRemoteContent).toBe(true);
    expect(
      sanitizeEmailHtml('<div style="background:url(https://t.example/bg.png)">x</div>')
        .hasRemoteContent,
    ).toBe(true);
    expect(
      sanitizeEmailHtml("<style>.a{background:url('//t.example/x.png')}</style>").hasRemoteContent,
    ).toBe(true);
    expect(sanitizeEmailHtml('<img src="cid:logo">').hasRemoteContent).toBe(false);
    expect(sanitizeEmailHtml("<p>plain</p>").hasRemoteContent).toBe(false);
  });
});

describe("renderEmailHtml", () => {
  it("routes web links through the interstitial with safe rel/target", () => {
    const out = render('<a href="https://bank.example/login?x=1&y=2">Log in</a>');
    expect(out).toContain('href="/link?u=https%3A%2F%2Fbank.example%2Flogin%3Fx%3D1%26y%3D2"');
    expect(out).toContain('target="_blank"');
    expect(out).toContain('rel="noopener noreferrer nofollow"');
  });

  it("keeps mailto links and strips relative or unknown schemes", () => {
    expect(render('<a href="mailto:help@acme.example">Mail</a>')).toContain(
      'href="mailto:help@acme.example"',
    );
    expect(render('<a href="/relative">x</a>')).not.toContain("href=");
    expect(render('<a href="ftp://x.example">x</a>')).not.toContain("href=");
  });

  it("blocks remote images until the reader opts in", () => {
    const html = '<img src="https://tracker.example/open.gif" width="1" height="1" alt="">';
    expect(render(html)).not.toContain("tracker.example");
    const allowed = render(html, true);
    expect(allowed).toContain('src="https://tracker.example/open.gif"');
    expect(allowed).toContain('referrerpolicy="no-referrer"');
  });

  it("never loads protocol-relative images, even with consent", () => {
    expect(render('<img src="//tracker.example/x.gif">', true)).not.toContain("tracker.example");
  });

  it("resolves inline cid images and drops unknown ones", () => {
    const images = new Map([["logo@acme", "data:image/png;base64,AAAA"]]);
    expect(render('<img src="cid:logo@acme">', false, images)).toContain(
      'src="data:image/png;base64,AAAA"',
    );
    expect(render('<img src="cid:missing">', false, images)).not.toContain("src=");
  });

  it("only keeps base64 raster data URIs", () => {
    expect(render('<img src="data:image/png;base64,iVBORw0KGgo=">')).toContain(
      "data:image/png;base64",
    );
    expect(render('<img src="data:text/html,<script>alert(1)</script>">')).not.toContain(
      "data:text",
    );
  });
});

describe("emailDocumentCsp", () => {
  it("denies scripts, forms and network access by default", () => {
    const csp = emailDocumentCsp(false);
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("script-src 'none'");
    expect(csp).toContain("form-action 'none'");
    expect(csp).toContain("img-src data:;");
    expect(csp).toContain("sandbox allow-popups allow-popups-to-escape-sandbox");
    expect(csp).not.toContain("allow-scripts");
    expect(csp).not.toContain("allow-same-origin");
  });

  it("only widens img-src when remote images are allowed", () => {
    expect(emailDocumentCsp(true)).toContain("img-src data: https: http:");
    expect(emailDocumentCsp(true)).toContain("script-src 'none'");
  });
});

describe("makePreview", () => {
  it("collapses whitespace and truncates", () => {
    expect(makePreview("Hello\n\n  world\t!")).toBe("Hello world !");
    const long = makePreview("a".repeat(500), 50);
    expect(long).toHaveLength(50);
    expect(long.endsWith("…")).toBe(true);
    expect(makePreview(null)).toBe("");
  });
});
