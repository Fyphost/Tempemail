import { connection } from "next/server";
import { Suspense } from "react";

import { InboxApp, type InboxAppProps } from "@/components/inbox/inbox-app";
import { MessageListSkeleton } from "@/components/inbox/message-list";
import { currentInboxToken, getSessionUser } from "@/server/auth/session";
import { getAvailableDomains } from "@/server/domains/service";
import {
  findInboxByToken,
  inboxLimits,
  listUserInboxes,
  serializeInbox,
} from "@/server/inboxes/service";
import { listMessages } from "@/server/messages/service";
import { effectivePlan, getSettings, limitsFor } from "@/server/settings";

const LIFETIME_PRESETS = [60, 360, 1_440, 4_320, 10_080, 20_160, 43_200];

async function loadInitialState(): Promise<InboxAppProps> {
  const [settings, user, token] = await Promise.all([
    getSettings(),
    getSessionUser(),
    currentInboxToken(),
  ]);
  const plan = effectivePlan(user?.plan ?? "free", settings);
  const limits = limitsFor(plan, settings);
  const domains = await getAvailableDomains(plan);

  let initialInbox: InboxAppProps["initialInbox"] = null;
  let initialState: InboxAppProps["initialState"] = "none";
  let initialPage: InboxAppProps["initialPage"] = null;

  const found = token ? await findInboxByToken(token) : null;
  if (found) {
    initialInbox = serializeInbox(found.inbox, found.domain, await inboxLimits(found.inbox));
    if (found.expired) {
      initialState = "expired";
    } else {
      initialState = "ready";
      initialPage = await listMessages(found.inbox.id, { limit: 50 });
    }
  }

  const owned = user ? await listUserInboxes(user.id) : [];
  const lifetimeOptions = limits.customRetention
    ? LIFETIME_PRESETS.filter((minutes) => minutes <= limits.maxLifetimeMinutes)
    : null;

  return {
    initialInbox,
    initialState,
    initialPage,
    domains: domains.map((domain) => ({
      name: domain.name,
      premium: domain.visibility === "premium",
    })),
    defaultDomain:
      (domains.find((domain) => domain.visibility === "public") ?? domains[0])?.name ?? null,
    ownedInboxes: owned.map(({ inbox }) => ({
      id: inbox.publicId,
      address: inbox.address,
      expiresAt: inbox.expiresAt.toISOString(),
    })),
    lifetimeOptions: lifetimeOptions && lifetimeOptions.length > 1 ? lifetimeOptions : null,
    replacesCurrent: !user || limits.maxConcurrentInboxes <= 1,
  };
}

export default async function InboxPage() {
  await connection();
  const initial = await loadInitialState();
  return (
    <Suspense fallback={<MessageListSkeleton />}>
      <InboxApp key={initial.initialInbox?.id ?? "none"} {...initial} />
    </Suspense>
  );
}
