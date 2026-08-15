import type { Metadata } from "next";

import { PERMISSIONS } from "@/lib/permissions";
import { requirePermission } from "@/server/auth/rbac";
import { prisma } from "@/lib/prisma";
import { getPosMenu } from "@/server/services/menu";
import { listSelectableTables } from "@/server/services/tables";
import { listActiveDiscounts } from "@/server/services/discounts";

import { PosTerminal } from "./pos-terminal";

export const metadata: Metadata = { title: "POS" };
export const dynamic = "force-dynamic";

export default async function PosPage() {
  const user = await requirePermission(PERMISSIONS.POS_USE);

  const [categories, tables, discounts, restaurant] = await Promise.all([
    getPosMenu(user.restaurantId),
    listSelectableTables(user.restaurantId),
    listActiveDiscounts(user.restaurantId),
    prisma.restaurant.findUniqueOrThrow({
      where: { id: user.restaurantId },
      select: { currencySymbol: true, taxRate: true, serviceChargeRate: true },
    }),
  ]);

  return (
    <PosTerminal
      categories={categories}
      tables={tables}
      discounts={discounts.map((d) => ({
        id: d.id,
        code: d.code,
        name: d.name,
        type: d.type,
        value: d.value,
        minOrderAmount: d.minOrderAmount,
      }))}
      currency={restaurant.currencySymbol}
      taxRate={Number(restaurant.taxRate)}
      serviceChargeRate={Number(restaurant.serviceChargeRate)}
      canDiscount={user.permissions.includes(PERMISSIONS.DISCOUNTS_APPLY)}
      canPay={user.permissions.includes(PERMISSIONS.PAYMENTS_PROCESS)}
    />
  );
}
