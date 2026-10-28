import { sql } from "drizzle-orm";
import Link from "next/link";

import { AdminPageHeader } from "@/components/admin/admin-shell";
import { DomainsManager, type DomainRow } from "@/components/admin/domains-manager";
import { requireAdmin } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { domainVerificationState, getAllDomains } from "@/server/domains/service";
import { getEnv } from "@/server/env";

export const metadata = { title: "Domains" };

export default async function AdminDomainsPage() {
  await requireAdmin();
  const domains = await getAllDomains({ fresh: true });
  const counts = await getDb().execute<{ domain_id: string; total: number }>(
    sql`select domain_id, count(*)::int as total from inboxes where expires_at > now() group by domain_id`,
  );
  const activeByDomain = new Map(counts.rows.map((row) => [row.domain_id, Number(row.total)]));

  const rows: DomainRow[] = domains.map((domain) => {
    const state = domainVerificationState(domain);
    return {
      id: domain.id,
      name: domain.name,
      isEnabled: domain.isEnabled,
      visibility: domain.visibility,
      expectedMx: domain.expectedMx,
      effectiveExpectedMx: state.expectedMx,
      mxStatus: domain.mxStatus,
      mxRecords: domain.mxRecords,
      mxError: domain.mxError,
      mxCheckedAt: domain.mxCheckedAt?.toISOString() ?? null,
      receiveStatus: domain.receiveStatus,
      receiveVerifiedAt: domain.receiveVerifiedAt?.toISOString() ?? null,
      probeAddress: state.probeAddress,
      defaultTtlMinutes: domain.defaultTtlMinutes,
      receiving: state.receiving,
      activeInboxes: activeByDomain.get(domain.id) ?? 0,
    };
  });

  return (
    <>
      <AdminPageHeader
        title="Domains"
        description="Only domains with verified MX records and a confirmed test delivery are offered to visitors."
      />
      <DomainsManager domains={rows} skipMx={getEnv().SKIP_MX_CHECK} />
      <p className="mt-6 text-sm text-muted-foreground">
        Setup guide for DNS, the built-in SMTP server, Mailgun and Cloudflare Email Routing:{" "}
        <Link
          href="https://github.com/Fyphost/Tempemail/blob/main/docs/dns-and-inbound-email.md"
          className="font-medium text-primary hover:underline"
        >
          docs/dns-and-inbound-email.md
        </Link>
      </p>
    </>
  );
}
