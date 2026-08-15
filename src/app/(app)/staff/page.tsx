import type { Metadata } from "next";
import { startOfMonth } from "date-fns";

import { PageHeader, PageShell } from "@/components/shared/page-header";
import { prisma } from "@/lib/prisma";
import { PERMISSIONS } from "@/lib/permissions";
import { requirePermission } from "@/server/auth/rbac";
import { getStaffReport } from "@/server/services/analytics";

import { StaffView } from "./staff-view";

export const metadata: Metadata = { title: "Staff" };
export const dynamic = "force-dynamic";

export default async function StaffPage() {
  const user = await requirePermission(PERMISSIONS.STAFF_VIEW);

  const now = new Date();
  const [staff, roles, performance, restaurant] = await Promise.all([
    prisma.user.findMany({
      where: { restaurantId: user.restaurantId, deletedAt: null },
      include: { role: { select: { id: true, name: true, label: true } } },
      orderBy: [{ status: "asc" }, { name: "asc" }],
    }),
    prisma.role.findMany({
      orderBy: { name: "asc" },
      include: { _count: { select: { permissions: true } } },
    }),
    getStaffReport(user.restaurantId, { from: startOfMonth(now), to: now }),
    prisma.restaurant.findUniqueOrThrow({
      where: { id: user.restaurantId },
      select: { currencySymbol: true },
    }),
  ]);

  return (
    <PageShell>
      <PageHeader
        title="Staff"
        description="Accounts, roles and this month's service performance."
      />
      <StaffView
        staff={staff.map((member) => ({
          id: member.id,
          name: member.name,
          email: member.email,
          phone: member.phone,
          status: member.status,
          roleId: member.roleId,
          roleName: member.role.name,
          roleLabel: member.role.label,
          hireDate: member.hireDate,
          lastLoginAt: member.lastLoginAt,
        }))}
        roles={roles.map((role) => ({
          id: role.id,
          name: role.name,
          label: role.label,
          description: role.description,
          permissionCount: role._count.permissions,
        }))}
        performance={performance}
        currency={restaurant.currencySymbol}
        canManage={user.permissions.includes(PERMISSIONS.STAFF_MANAGE)}
        currentUserId={user.id}
      />
    </PageShell>
  );
}
