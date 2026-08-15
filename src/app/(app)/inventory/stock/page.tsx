import type { Metadata } from "next";
import { AlertTriangle, CalendarClock, PackageX, Wallet } from "lucide-react";

import { PageHeader, PageShell } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { prisma } from "@/lib/prisma";
import { formatMoney } from "@/lib/money";
import { PERMISSIONS } from "@/lib/permissions";
import { requirePermission } from "@/server/auth/rbac";
import { getInventoryAlerts, getInventoryValue, listIngredients } from "@/server/services/inventory";
import { plain } from "@/lib/serialize";

import { StockView } from "./stock-view";

export const metadata: Metadata = { title: "Stock" };
export const dynamic = "force-dynamic";

export default async function StockPage({ searchParams }: PageProps<"/inventory/stock">) {
  const user = await requirePermission(PERMISSIONS.INVENTORY_VIEW);
  const params = await searchParams;
  const ingredientId = typeof params.ingredient === "string" ? params.ingredient : undefined;

  const [ingredients, alerts, value, transactions, restaurant] = await Promise.all([
    listIngredients(user.restaurantId),
    getInventoryAlerts(user.restaurantId),
    getInventoryValue(user.restaurantId),
    prisma.inventoryTransaction.findMany({
      where: {
        ingredient: { restaurantId: user.restaurantId },
        ...(ingredientId ? { ingredientId } : {}),
      },
      include: {
        ingredient: { select: { id: true, name: true, unit: true } },
        user: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.restaurant.findUniqueOrThrow({
      where: { id: user.restaurantId },
      select: { currencySymbol: true },
    }),
  ]);
  const currency = restaurant.currencySymbol;

  return (
    <PageShell>
      <PageHeader
        title="Stock"
        description="Record deliveries, waste and counts. Every movement is written to the ledger."
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Inventory value"
          value={formatMoney(value, currency)}
          icon={Wallet}
          hint="at current cost prices"
        />
        <StatCard
          label="Out of stock"
          value={String(alerts.counts.outOfStock)}
          icon={PackageX}
          tone={alerts.counts.outOfStock > 0 ? "destructive" : "success"}
          hint="need reordering now"
        />
        <StatCard
          label="Low stock"
          value={String(alerts.counts.lowStock)}
          icon={AlertTriangle}
          tone={alerts.counts.lowStock > 0 ? "warning" : "success"}
          hint="at or below minimum"
        />
        <StatCard
          label="Expiring soon"
          value={String(alerts.counts.expiring)}
          icon={CalendarClock}
          tone={alerts.counts.expiring > 0 ? "info" : "success"}
          hint="within three days"
        />
      </div>

      <StockView
        ingredients={ingredients.map((i) => ({
          id: i.id,
          name: i.name,
          sku: i.sku,
          category: i.category,
          unit: i.unit,
          quantity: i.quantity,
          minQuantity: i.minQuantity,
          cost: i.cost,
          expiresAt: i.expiresAt,
        }))}
        alerts={{
          outOfStock: alerts.outOfStock.map((i) => ({ id: i.id, name: i.name, unit: i.unit })),
          lowStock: alerts.lowStock.map((i) => ({
            id: i.id,
            name: i.name,
            unit: i.unit,
            quantity: i.quantity,
            minQuantity: i.minQuantity,
          })),
          expiring: alerts.expiring.map((i) => ({
            id: i.id,
            name: i.name,
            unit: i.unit,
            expiresAt: i.expiresAt,
          })),
        }}
        transactions={plain(transactions).map((t) => ({
          id: t.id,
          type: t.type,
          quantity: t.quantity,
          quantityAfter: t.quantityAfter,
          unitCost: t.unitCost,
          reference: t.reference,
          note: t.note,
          createdAt: t.createdAt,
          ingredientId: t.ingredient.id,
          ingredientName: t.ingredient.name,
          unit: t.ingredient.unit,
          userName: t.user?.name ?? "System",
        }))}
        selectedIngredientId={ingredientId ?? "ALL"}
        currency={currency}
        canManage={user.permissions.includes(PERMISSIONS.INVENTORY_MANAGE)}
      />
    </PageShell>
  );
}
