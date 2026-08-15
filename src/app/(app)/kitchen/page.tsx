import type { Metadata } from "next";

import { PERMISSIONS } from "@/lib/permissions";
import { requirePermission } from "@/server/auth/rbac";
import { getKitchenOrders } from "@/server/services/orders";

import { KitchenBoard } from "./kitchen-board";

export const metadata: Metadata = { title: "Kitchen" };
export const dynamic = "force-dynamic";

export default async function KitchenPage() {
  const user = await requirePermission(PERMISSIONS.KITCHEN_VIEW);
  const orders = await getKitchenOrders(user.restaurantId);

  return (
    <KitchenBoard
      orders={orders.map((order) => ({
        id: order.id,
        orderNumber: order.orderNumber,
        type: order.type,
        status: order.status,
        priority: order.priority,
        tableNumber: order.table?.number ?? null,
        placedAt: order.placedAt,
        kitchenAt: order.kitchenAt,
        readyAt: order.readyAt,
        notes: order.notes,
        items: order.items
          .filter((item) => item.status !== "CANCELLED")
          .map((item) => ({
            id: item.id,
            name: item.nameSnap,
            variant: item.variantSnap,
            quantity: item.quantity,
            notes: item.notes,
            addons: item.addons.map((a) => a.nameSnap),
          })),
      }))}
      canUpdate={user.permissions.includes(PERMISSIONS.KITCHEN_UPDATE)}
    />
  );
}
