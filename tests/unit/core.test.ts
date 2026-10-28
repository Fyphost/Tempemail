import { describe, expect, it } from "vitest";

import { hostMatches, mxMatchesExpected } from "@/server/domains/dns";
import { retryDelayMs } from "@/server/jobs/queue";
import { jobStatusFor } from "@/server/mail/processor";
import { decodeCursor, encodeCursor } from "@/server/messages/service";
import { formatSseEvent } from "@/server/realtime/sse";
import { consumeMemoryRateLimit } from "@/server/security/rate-limit";
import {
  DEFAULT_SETTINGS,
  effectivePlan,
  mergeWithDefaults,
  parseSettings,
} from "@/server/settings";

describe("settings", () => {
  it("fills missing keys from defaults and ignores unknown keys", () => {
    const parsed = parseSettings({
      premiumEnabled: true,
      plans: { free: { inboxTtlMinutes: 30 } },
      bogus: 1,
    });
    expect(parsed.premiumEnabled).toBe(true);
    expect(parsed.plans.free.inboxTtlMinutes).toBe(30);
    expect(parsed.plans.free.maxMessagesPerInbox).toBe(
      DEFAULT_SETTINGS.plans.free.maxMessagesPerInbox,
    );
    expect("bogus" in parsed).toBe(false);
  });

  it("falls back to defaults when stored settings are invalid", () => {
    expect(parseSettings({ plans: { free: { inboxTtlMinutes: -5 } } })).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings(undefined)).toEqual(DEFAULT_SETTINGS);
  });

  it("only grants premium while premium features are enabled", () => {
    expect(effectivePlan("premium", { ...DEFAULT_SETTINGS, premiumEnabled: false })).toBe("free");
    expect(effectivePlan("premium", { ...DEFAULT_SETTINGS, premiumEnabled: true })).toBe("premium");
    expect(effectivePlan(null, { ...DEFAULT_SETTINGS, premiumEnabled: true })).toBe("free");
  });

  it("merges arrays as values, not element-wise", () => {
    expect(mergeWithDefaults({ list: ["a", "b"] }, { list: ["c"] })).toEqual({ list: ["c"] });
  });
});

describe("MX verification", () => {
  it("matches exact hosts and wildcard suffixes", () => {
    expect(hostMatches("mx.example.com.", "mx.example.com")).toBe(true);
    expect(hostMatches("route1.mx.cloudflare.net", "*.mx.cloudflare.net")).toBe(true);
    expect(hostMatches("mx.cloudflare.net", "*.mx.cloudflare.net")).toBe(false);
    expect(hostMatches("evilmx.cloudflare.net", "*.mx.cloudflare.net")).toBe(false);
  });

  it("requires every published MX host to point at our infrastructure", () => {
    expect(
      mxMatchesExpected(
        ["mxa.mailgun.org", "mxb.mailgun.org"],
        ["mxa.mailgun.org", "mxb.mailgun.org"],
      ),
    ).toBe(true);
    expect(mxMatchesExpected(["mxa.mailgun.org", "aspmx.l.google.com"], ["mxa.mailgun.org"])).toBe(
      false,
    );
    expect(mxMatchesExpected([], ["mx.example.com"])).toBe(false);
    expect(mxMatchesExpected(["mx.example.com"], [])).toBe(false);
  });
});

describe("pagination cursors", () => {
  it("round-trips and rejects garbage", () => {
    const cursor = encodeCursor({
      receivedAt: new Date("2026-01-02T03:04:05.000Z"),
      publicId: "msg_abc",
    });
    expect(decodeCursor(cursor)).toEqual({
      receivedAt: new Date("2026-01-02T03:04:05.000Z"),
      publicId: "msg_abc",
    });
    expect(decodeCursor("not-base64-json")).toBeNull();
    expect(decodeCursor(Buffer.from(JSON.stringify(["nope", 1])).toString("base64url"))).toBeNull();
  });
});

describe("server-sent events", () => {
  it("formats frames and strips newlines from event names", () => {
    expect(formatSseEvent("message.received", { a: 1 })).toBe(
      'event: message.received\ndata: {"a":1}\n\n',
    );
    expect(formatSseEvent("x\ny", "z", "1")).toBe('id: 1\nevent: xy\ndata: "z"\n\n');
  });
});

describe("job processing", () => {
  it("backs off exponentially with a ceiling", () => {
    expect(retryDelayMs(1)).toBe(30_000);
    expect(retryDelayMs(2)).toBe(60_000);
    expect(retryDelayMs(20)).toBe(30 * 60_000);
  });

  it("classifies job outcomes", () => {
    expect(jobStatusFor({ delivered: 1 })).toBe("completed");
    expect(jobStatusFor({ delivered: 0, duplicates: 1 })).toBe("completed");
    expect(jobStatusFor({ delivered: 0, probes: ["verify@x.test"] })).toBe("completed");
    expect(
      jobStatusFor({ delivered: 0, rejected: [{ recipient: "a", reason: "mailbox_full" }] }),
    ).toBe("rejected");
  });
});

describe("in-memory rate limiter", () => {
  it("allows up to the limit within a window", () => {
    const key = `test:${Math.random()}`;
    const results = Array.from({ length: 4 }, () => consumeMemoryRateLimit(key, 3, 60));
    expect(results.map((r) => r.allowed)).toEqual([true, true, true, false]);
    expect(results[3]!.retryAfterSeconds).toBeGreaterThan(0);
  });
});
