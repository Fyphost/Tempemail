import { randomInt } from "node:crypto";
import { domainToASCII } from "node:url";

const CONSONANTS = "bcdfghjklmnprstvwz";
const VOWELS = "aeiou";

/**
 * Pronounceable random local part such as "kavitore4821".
 * 4 syllables (90^4) x 4 digits gives ~6.5e11 combinations (~39 bits),
 * enough that addresses are not practical to guess or enumerate. Inbox access
 * never depends on the address itself; it always requires a secret token.
 */
export function generateLocalPart(): string {
  let out = "";
  for (let i = 0; i < 4; i += 1) {
    out += CONSONANTS[randomInt(0, CONSONANTS.length)];
    out += VOWELS[randomInt(0, VOWELS.length)];
  }
  out += String(randomInt(0, 10_000)).padStart(4, "0");
  return out;
}

const DOMAIN_LABEL = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/;

export function normalizeDomain(input: string): string | null {
  const trimmed = input.trim().replace(/\.$/, "").toLowerCase();
  if (!trimmed || trimmed.length > 253) return null;
  const ascii = domainToASCII(trimmed);
  if (!ascii) return null;
  const labels = ascii.split(".");
  if (labels.length < 2) return null;
  if (!labels.every((label) => DOMAIN_LABEL.test(label))) return null;
  if (/^[0-9]+$/.test(labels[labels.length - 1]!)) return null;
  return ascii;
}

export interface ParsedAddress {
  /** Full normalized address, lowercase. */
  address: string;
  local: string;
  /** Local part with any "+tag" sub-address removed. */
  baseLocal: string;
  domain: string;
}

const LOCAL_PART = /^[a-z0-9!#$%&'*+/=?^_`{|}~.-]{1,64}$/;

/** Parse an envelope address ("<User@Example.com>") into normalized parts. */
export function parseAddress(input: string): ParsedAddress | null {
  let value = input.trim();
  if (value.startsWith("<") && value.endsWith(">")) value = value.slice(1, -1).trim();
  const at = value.lastIndexOf("@");
  if (at <= 0 || at === value.length - 1) return null;
  const local = value.slice(0, at).toLowerCase();
  const domain = normalizeDomain(value.slice(at + 1));
  if (!domain || !LOCAL_PART.test(local) || local.startsWith(".") || local.endsWith("."))
    return null;
  const plus = local.indexOf("+");
  const baseLocal = plus > 0 ? local.slice(0, plus) : local;
  return { address: `${local}@${domain}`, local, baseLocal, domain };
}

/** Split a comma/semicolon/whitespace separated recipient list and normalize each entry. */
export function parseRecipientList(input: string | null | undefined): string[] {
  if (!input) return [];
  const seen = new Set<string>();
  for (const part of input.split(/[,;\s]+/)) {
    const parsed = parseAddress(part);
    if (parsed) seen.add(parsed.address);
  }
  return [...seen];
}
