import type { Metadata } from "next";

import { prisma } from "@/lib/prisma";
import { PERMISSIONS } from "@/lib/permissions";
import { requirePermission } from "@/server/auth/rbac";

import { RestaurantSettingsForm } from "./restaurant-settings-form";

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await requirePermission(PERMISSIONS.SETTINGS_VIEW);

  const restaurant = await prisma.restaurant.findUniqueOrThrow({
    where: { id: user.restaurantId },
  });

  return (
    <RestaurantSettingsForm
      restaurant={{
        name: restaurant.name,
        address: restaurant.address,
        phone: restaurant.phone,
        email: restaurant.email,
        currency: restaurant.currency,
        currencySymbol: restaurant.currencySymbol,
        taxRate: Number(restaurant.taxRate),
        serviceChargeRate: Number(restaurant.serviceChargeRate),
        discountApprovalThreshold: Number(restaurant.discountApprovalThreshold),
        openingTime: restaurant.openingTime,
        closingTime: restaurant.closingTime,
      }}
      canManage={user.permissions.includes(PERMISSIONS.SETTINGS_MANAGE)}
    />
  );
}
