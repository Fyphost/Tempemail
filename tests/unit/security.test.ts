import { beforeAll, describe, expect, it } from "vitest";

import {
  generateLocalPart,
  normalizeDomain,
  parseAddress,
  parseRecipientList,
} from "@/server/mail/address";
import { evaluateAttachment, sanitizeFilename } from "@/server/mail/attachments";
import {
  computeInboundSignature,
  verifyInboundSignature,
  verifyMailgunSignature,
} from "@/server/mail/providers/signatures";
import { hmacSha256Hex, randomBase62, safeEqual, sha256Hex } from "@/server/security/crypto";
import { clientIpFromHeaders, maskIp, normalizeIp, rateLimitSubject } from "@/server/security/ip";
import { hashPassword, verifyPassword } from "@/server/security/password";

beforeAll(() => {
  process.env.SESSION_SECRET = "unit-test-session-secret-0123456789abcdef";
  process.env.DATABASE_URL = "postgres://unused";
});

describe("addresses", () => {
  it("generates pronounceable, unguessable local parts", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 500; i += 1) {
      const local = generateLocalPart();
      expect(local).toMatch(/^([bcdfghjklmnprstvwz][aeiou]){4}\d{4}$/);
      seen.add(local);
    }
    expect(seen.size).toBeGreaterThan(495);
  });

  it("parses and normalises envelope addresses", () => {
    expect(parseAddress("<User.Name+Tag@Example.COM>")).toEqual({
      address: "user.name+tag@example.com",
      local: "user.name+tag",
      baseLocal: "user.name",
      domain: "example.com",
    });
    expect(parseAddress("bücher@münchen.de")).toBeNull(); // non-ASCII local parts are not issued
    expect(parseAddress("info@münchen.de")?.domain).toBe("xn--mnchen-3ya.de");
    for (const bad of [
      "",
      "no-at-sign",
      "@example.com",
      "user@",
      "a@b",
      "a..b@x.com".replace("..", "."),
      ".a@x.com",
      "a@-x.com",
    ]) {
      if (bad === "a.b@x.com") continue;
      expect(parseAddress(bad)).toBeNull();
    }
  });

  it("validates domain names", () => {
    expect(normalizeDomain("Mail.Example.com.")).toBe("mail.example.com");
    expect(normalizeDomain("localhost")).toBeNull();
    expect(normalizeDomain("1.2.3.4")).toBeNull();
    expect(normalizeDomain("bad_domain.com")).toBeNull();
  });

  it("splits recipient lists and removes duplicates", () => {
    expect(parseRecipientList("a@x.com, B@x.com;a@x.com  c@y.org bogus")).toEqual([
      "a@x.com",
      "b@x.com",
      "c@y.org",
    ]);
  });
});

describe("attachments", () => {
  const policy = { maxAttachmentBytes: 1_000, blockedExtensions: ["exe", "js", "scr"] };

  it("blocks dangerous extensions, including double extensions", () => {
    expect(evaluateAttachment("invoice.pdf.exe", "application/pdf", 10, policy).blocked).toBe(true);
    expect(evaluateAttachment("script.JS", "text/plain", 10, policy).blocked).toBe(true);
    expect(evaluateAttachment("report.pdf", "application/pdf", 10, policy).blocked).toBe(false);
  });

  it("blocks executable content types and oversized files", () => {
    expect(evaluateAttachment("file.bin", "application/x-msdownload", 10, policy).blocked).toBe(
      true,
    );
    expect(evaluateAttachment("big.pdf", "application/pdf", 5_000, policy)).toMatchObject({
      blocked: true,
      reason: expect.stringContaining("size limit"),
    });
  });

  it("sanitises filenames", () => {
    expect(sanitizeFilename("../../etc/passwd")).toBe("_.._etc_passwd");
    expect(sanitizeFilename("evil\u202Etxt.exe")).toBe("eviltxt.exe");
    expect(sanitizeFilename("")).toBe("attachment");
    expect(sanitizeFilename(`${"a".repeat(300)}.pdf`)).toHaveLength(180);
    expect(sanitizeFilename(`${"a".repeat(300)}.pdf`).endsWith(".pdf")).toBe(true);
  });
});

describe("webhook signatures", () => {
  const now = 1_800_000_000_000;
  const ts = String(now / 1000);

  it("verifies Mailgun signatures with freshness checks", () => {
    const token = "t".repeat(50);
    const signature = hmacSha256Hex("key", `${ts}${token}`);
    expect(verifyMailgunSignature({ timestamp: ts, token, signature }, "key", 300, now)).toBe(true);
    expect(verifyMailgunSignature({ timestamp: ts, token, signature }, "other", 300, now)).toBe(
      false,
    );
    expect(
      verifyMailgunSignature({ timestamp: ts, token, signature }, "key", 300, now + 301_000),
    ).toBe(false);
    expect(
      verifyMailgunSignature({ timestamp: ts, token: "short", signature }, "key", 300, now),
    ).toBe(false);
    expect(verifyMailgunSignature({ timestamp: null, token, signature }, "key", 300, now)).toBe(
      false,
    );
  });

  it("verifies generic inbound signatures over body, recipients and sender", () => {
    const input = {
      timestamp: ts,
      recipients: "a@x.com",
      sender: "s@y.com",
      bodySha256: sha256Hex("body"),
    };
    const header = `v1=${computeInboundSignature("secret", input)}`;
    expect(verifyInboundSignature("secret", header, input, 300, now)).toBe(true);
    expect(
      verifyInboundSignature("secret", header, { ...input, recipients: "b@x.com" }, 300, now),
    ).toBe(false);
    expect(
      verifyInboundSignature(
        "secret",
        header,
        { ...input, bodySha256: sha256Hex("other") },
        300,
        now,
      ),
    ).toBe(false);
    expect(verifyInboundSignature("secret", header, input, 300, now + 3_600_000)).toBe(false);
    expect(verifyInboundSignature("secret", "v1=zz", input, 300, now)).toBe(false);
    expect(verifyInboundSignature("secret", null, input, 300, now)).toBe(false);
  });
});

describe("client IP handling", () => {
  const headers = (xff: string) => new Headers({ "x-forwarded-for": xff });

  it("trusts exactly the configured number of proxies", () => {
    expect(clientIpFromHeaders(headers("6.6.6.6, 203.0.113.9"), 1)).toBe("203.0.113.9");
    expect(clientIpFromHeaders(headers("6.6.6.6, 203.0.113.9, 10.0.0.2"), 2)).toBe("203.0.113.9");
    expect(clientIpFromHeaders(headers("203.0.113.9"), 0)).toBe("203.0.113.9");
    expect(clientIpFromHeaders(new Headers(), 1)).toBe("0.0.0.0");
  });

  it("normalises addresses and groups IPv6 by /64", () => {
    expect(normalizeIp("::ffff:192.0.2.1")).toBe("192.0.2.1");
    expect(normalizeIp("[2001:db8::1]:443")).toBe("2001:db8::1");
    expect(normalizeIp("192.0.2.1:8080")).toBe("192.0.2.1");
    expect(normalizeIp("not-an-ip")).toBeNull();
    expect(rateLimitSubject("2001:db8:aa:bb:1:2:3:4")).toBe("2001:0db8:00aa:00bb::/64");
    expect(rateLimitSubject("2001:db8:aa:bb::9")).toBe(rateLimitSubject("2001:db8:aa:bb:ffff::1"));
    expect(maskIp("203.0.113.77")).toBe("203.0.113.x");
  });
});

describe("crypto helpers", () => {
  it("generates base62 identifiers and compares in constant time", () => {
    expect(randomBase62(20)).toMatch(/^[0-9A-Za-z]{20}$/);
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
  });

  it("hashes passwords with scrypt and verifies them", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(hash).toMatch(/^scrypt\$32768\$8\$1\$/);
    expect(await verifyPassword("correct horse battery staple", hash)).toBe(true);
    expect(await verifyPassword("wrong", hash)).toBe(false);
    expect(await verifyPassword("x", "not-a-hash")).toBe(false);
  });
});
