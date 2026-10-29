import { promises as dns } from "node:dns";

export interface MxLookup {
  hosts: string[];
  error: string | null;
  missing: boolean;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`DNS lookup timed out after ${ms}ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export async function lookupMx(domain: string, timeoutMs = 8_000): Promise<MxLookup> {
  try {
    const records = await withTimeout(dns.resolveMx(domain), timeoutMs);
    const hosts = records
      .sort((a, b) => a.priority - b.priority)
      .map((record) => record.exchange.toLowerCase().replace(/\.$/, ""))
      .filter(Boolean);
    return { hosts, error: null, missing: hosts.length === 0 };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENODATA" || code === "ENOTFOUND") {
      return { hosts: [], error: null, missing: true };
    }
    return {
      hosts: [],
      error: error instanceof Error ? error.message : String(error),
      missing: false,
    };
  }
}

/** Expected patterns may be exact hosts or "*.suffix" wildcards. */
export function hostMatches(host: string, pattern: string): boolean {
  const h = host.toLowerCase().replace(/\.$/, "");
  const p = pattern.toLowerCase().replace(/\.$/, "");
  if (p.startsWith("*.")) {
    const suffix = p.slice(1);
    return h.endsWith(suffix) && h.length > suffix.length;
  }
  return h === p;
}

/** True when every published MX host points at the configured inbound infrastructure. */
export function mxMatchesExpected(hosts: string[], expected: string[]): boolean {
  if (hosts.length === 0 || expected.length === 0) return false;
  return hosts.every((host) => expected.some((pattern) => hostMatches(host, pattern)));
}
