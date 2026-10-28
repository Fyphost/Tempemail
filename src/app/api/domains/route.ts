import { resolvePrincipal } from "@/server/auth/request";
import { getAvailableDomains } from "@/server/domains/service";
import { ok } from "@/server/http/respond";
import { apiRoute } from "@/server/http/route";
import { effectivePlan } from "@/server/settings";

export const dynamic = "force-dynamic";

/** Domains that are configured, verified and currently receiving email. */
export const GET = apiRoute(async (request, _context, { settings }) => {
  const principal = await resolvePrincipal(request, settings);
  const plan = effectivePlan(principal.user?.plan ?? "free", settings);
  const domains = await getAvailableDomains(plan);
  return ok({
    domains: domains.map((domain) => ({
      name: domain.name,
      premium: domain.visibility === "premium",
    })),
    defaultDomain:
      (domains.find((domain) => domain.visibility === "public") ?? domains[0])?.name ?? null,
  });
});
