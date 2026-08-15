import type { Metadata } from "next";

import { prisma } from "@/lib/prisma";
import { PERMISSIONS } from "@/lib/permissions";
import { requirePermission } from "@/server/auth/rbac";
import { listDiscounts } from "@/server/services/discounts";

import { DiscountsView } from "./discounts-view";

export const metadata: Metadata = { title: "Discounts" };
export const dynamic = "force-dynamic";

export default async function DiscountsPage() {
  const user = await requirePermission(PERMISSIONS.DISCOUNTS_MANAGE);

  const [discounts, restaurant] = await Promise.all([
    listDiscounts(user.restaurantId),
    prisma.restaurant.findUniqueOrThrow({
      where: { id: user.restaurantId },
      select: { currencySymbol: true, discountApprovalThreshold: true },
    }),
  ]);

  return (
    <DiscountsView
      discounts={discounts.map((d) => ({
        id: d.id,
        code: d.code,
        name: d.name,
        description: d.description,
        type: d.type,
        scope: d.scope,
        value: d.value,
        minOrderAmount: d.minOrderAmount,
        maxDiscount: d.maxDiscount,
        startsAt: d.startsAt,
        endsAt: d.endsAt,
        usageLimit: d.usageLimit,
        usageCount: d.usageCount,
        isActive: d.isActive,
        timesApplied: d._count.orders,
      }))}
      currency={restaurant.currencySymbol}
      approvalThreshold={Number(restaurant.discountApprovalThreshold)}
    />
  );
}
