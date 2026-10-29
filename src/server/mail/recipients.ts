import { and, eq, gt } from "drizzle-orm";

import { getDb } from "@/server/db/client";
import { inboxes, type PlanId } from "@/server/db/schema";
import { findDomainByName } from "@/server/domains/service";

import { parseAddress } from "./address";

export type RecipientTarget =
  | {
      kind: "inbox";
      address: string;
      inboxId: string;
      plan: PlanId;
      messageCount: number;
    }
  | { kind: "probe"; address: string; domainId: string };

/**
 * Map an envelope recipient to a live inbox (or a domain verification probe).
 * Routing always uses the SMTP envelope recipient, never the To: header.
 * "+tag" sub-addresses are delivered to the base address.
 */
export async function resolveRecipient(input: string): Promise<RecipientTarget | null> {
  const parsed = parseAddress(input);
  if (!parsed) return null;
  const domain = await findDomainByName(parsed.domain);
  if (!domain) return null;
  if (parsed.baseLocal === domain.probeLocalPart) {
    return { kind: "probe", address: parsed.address, domainId: domain.id };
  }
  if (!domain.isEnabled) return null;
  const [inbox] = await getDb()
    .select({ id: inboxes.id, plan: inboxes.plan, messageCount: inboxes.messageCount })
    .from(inboxes)
    .where(
      and(
        eq(inboxes.address, `${parsed.baseLocal}@${domain.name}`),
        gt(inboxes.expiresAt, new Date()),
      ),
    )
    .limit(1);
  if (!inbox) return null;
  return {
    kind: "inbox",
    address: parsed.address,
    inboxId: inbox.id,
    plan: inbox.plan,
    messageCount: inbox.messageCount,
  };
}
