import type { Metadata } from "next";

import { PageHeader, PageShell } from "@/components/shared/page-header";
import { PERMISSIONS } from "@/lib/permissions";
import { requirePermission } from "@/server/auth/rbac";
import { listCategories } from "@/server/services/menu";

import { CategoriesTable } from "./categories-table";

export const metadata: Metadata = { title: "Menu categories" };
export const dynamic = "force-dynamic";

export default async function CategoriesPage() {
  const user = await requirePermission(PERMISSIONS.MENU_VIEW);
  const categories = await listCategories(user.restaurantId);

  return (
    <PageShell>
      <PageHeader
        title="Categories"
        description="Group menu items the way they appear on the POS grid."
      />
      <CategoriesTable
        categories={categories.map((c) => ({
          id: c.id,
          name: c.name,
          description: c.description,
          color: c.color,
          sortOrder: c.sortOrder,
          isActive: c.isActive,
          itemCount: c._count.items,
        }))}
        canManage={user.permissions.includes(PERMISSIONS.MENU_MANAGE)}
      />
    </PageShell>
  );
}
