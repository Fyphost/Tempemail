import { AdminPageHeader } from "@/components/admin/admin-shell";
import { SettingsForm } from "@/components/admin/settings-form";
import { requireAdmin } from "@/server/auth/session";
import { invalidateSettingsCache, getSettings } from "@/server/settings";

export const metadata = { title: "Settings" };

export default async function AdminSettingsPage() {
  await requireAdmin();
  invalidateSettingsCache();
  const settings = await getSettings();
  return (
    <>
      <AdminPageHeader
        title="System settings"
        description="Limits, expiration, rate limits, API access and retention. Infrastructure secrets stay in environment variables."
      />
      <SettingsForm initial={settings} />
    </>
  );
}
