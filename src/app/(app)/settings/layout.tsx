import Link from "next/link";

import { PageShell } from "@/components/shared/page-header";
import { PERMISSIONS } from "@/lib/permissions";
import { requireUser } from "@/server/auth/session";
import { can } from "@/server/auth/rbac";

import { SettingsTabs } from "./settings-tabs";

export default async function SettingsLayout({ children }: LayoutProps<"/settings">) {
  const user = await requireUser();

  const tabs = [
    { href: "/settings", label: "Restaurant", visible: can(user, PERMISSIONS.SETTINGS_VIEW) },
    { href: "/settings/discounts", label: "Discounts", visible: can(user, PERMISSIONS.DISCOUNTS_MANAGE) },
    { href: "/settings/audit", label: "Audit log", visible: can(user, PERMISSIONS.AUDIT_VIEW) },
    { href: "/settings/profile", label: "My profile", visible: true },
  ].filter((tab) => tab.visible);

  return (
    <PageShell>
      <div>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Configure the restaurant, review what changed, and manage your own account.
        </p>
      </div>
      <SettingsTabs tabs={tabs.map(({ href, label }) => ({ href, label }))} />
      {children}
      <p className="text-xs text-muted-foreground">
        Signed in as {user.name} · <Link href="/dashboard" className="underline">Back to dashboard</Link>
      </p>
    </PageShell>
  );
}
