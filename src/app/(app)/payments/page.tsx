import type { Metadata } from "next";
import { Banknote, CreditCard, Receipt, RotateCcw } from "lucide-react";

import { DateRangeFilter } from "@/components/shared/date-range-filter";
import { PageHeader, PageShell } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { prisma } from "@/lib/prisma";
import { parsePreset, resolveRange } from "@/lib/date";
import { formatMoney } from "@/lib/money";
import { PERMISSIONS } from "@/lib/permissions";
import { requirePermission } from "@/server/auth/rbac";
import { getUnpaidOrders, listPayments } from "@/server/services/payments";
import type { PaymentMethod } from "@/generated/prisma/enums";

import { PaymentsView } from "./payments-view";

export const metadata: Metadata = { title: "Payments" };
export const dynamic = "force-dynamic";

export default async function PaymentsPage({ searchParams }: PageProps<"/payments">) {
  const user = await requirePermission(PERMISSIONS.PAYMENTS_VIEW);
  const params = await searchParams;

  const preset = parsePreset(typeof params.range === "string" ? params.range : undefined);
  const range = resolveRange(
    preset,
    typeof params.from === "string" ? params.from : undefined,
    typeof params.to === "string" ? params.to : undefined,
  );
  const method = (typeof params.method === "string" ? params.method : "ALL") as PaymentMethod | "ALL";
  const search = typeof params.q === "string" ? params.q : undefined;

  const [{ payments, byMethod }, unpaid, restaurant] = await Promise.all([
    listPayments(user.restaurantId, { from: range.from, to: range.to, method, search }),
    getUnpaidOrders(user.restaurantId),
    prisma.restaurant.findUniqueOrThrow({
      where: { id: user.restaurantId },
      select: { currencySymbol: true },
    }),
  ]);
  const currency = restaurant.currencySymbol;

  const total = byMethod.reduce((acc, m) => acc + m.total, 0);
  const count = byMethod.reduce((acc, m) => acc + m.count, 0);
  const outstanding = unpaid.reduce((acc, o) => acc + (o.total - o.paidTotal), 0);
  const cash = byMethod.find((m) => m.method === "CASH")?.total ?? 0;

  return (
    <PageShell>
      <PageHeader
        title="Payments"
        description="Settle open tickets and review everything taken through the till."
        actions={
          <DateRangeFilter
            preset={preset}
            from={typeof params.from === "string" ? params.from : undefined}
            to={typeof params.to === "string" ? params.to : undefined}
          />
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Taken"
          value={formatMoney(total, currency)}
          icon={CreditCard}
          hint={`${count} transaction${count === 1 ? "" : "s"}`}
        />
        <StatCard label="Cash" value={formatMoney(cash, currency)} icon={Banknote} tone="success" />
        <StatCard
          label="Awaiting payment"
          value={formatMoney(outstanding, currency)}
          icon={Receipt}
          tone={outstanding > 0 ? "warning" : "success"}
          hint={`${unpaid.length} open ticket${unpaid.length === 1 ? "" : "s"}`}
        />
        <StatCard
          label="Non-cash share"
          value={total > 0 ? `${(((total - cash) / total) * 100).toFixed(0)}%` : "—"}
          icon={RotateCcw}
          tone="info"
          hint="card, QR and transfer"
        />
      </div>

      <PaymentsView
        payments={payments.map((p) => ({
          id: p.id,
          method: p.method,
          amount: p.amount,
          received: p.received,
          change: p.change,
          reference: p.reference,
          state: p.state,
          createdAt: p.createdAt,
          orderId: p.order.id,
          orderNumber: p.order.orderNumber,
          orderTotal: p.order.total,
          userName: p.user.name,
        }))}
        byMethod={byMethod}
        unpaidOrders={unpaid.map((o) => ({
          id: o.id,
          orderNumber: o.orderNumber,
          type: o.type,
          status: o.status,
          total: o.total,
          paidTotal: o.paidTotal,
          itemCount: o._count.items,
          tableNumber: o.table?.number ?? null,
          customerName: o.customer?.name ?? null,
          placedAt: o.placedAt,
        }))}
        currency={currency}
        method={method}
        search={search ?? ""}
        canProcess={user.permissions.includes(PERMISSIONS.PAYMENTS_PROCESS)}
        canRefund={user.permissions.includes(PERMISSIONS.PAYMENTS_REFUND)}
      />
    </PageShell>
  );
}
