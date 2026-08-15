import type { Metadata } from "next";

import { PageHeader, PageShell } from "@/components/shared/page-header";
import { prisma } from "@/lib/prisma";
import { PERMISSIONS } from "@/lib/permissions";
import { requirePermission } from "@/server/auth/rbac";
import { listReservations } from "@/server/services/reservations";
import { listSelectableTables } from "@/server/services/tables";
import type { ReservationStatus } from "@/generated/prisma/enums";

import { ReservationsView } from "./reservations-view";

export const metadata: Metadata = { title: "Reservations" };
export const dynamic = "force-dynamic";

export default async function ReservationsPage({ searchParams }: PageProps<"/reservations">) {
  const user = await requirePermission(PERMISSIONS.RESERVATIONS_VIEW);
  const params = await searchParams;

  const status = (typeof params.status === "string" ? params.status : "ALL") as
    | ReservationStatus
    | "ALL";
  const date = typeof params.date === "string" ? params.date : undefined;
  const search = typeof params.q === "string" ? params.q : undefined;

  const [reservations, tables, customers] = await Promise.all([
    listReservations(user.restaurantId, {
      status,
      date: date ? new Date(`${date}T12:00:00`) : undefined,
      search,
    }),
    listSelectableTables(user.restaurantId),
    prisma.customer.findMany({
      where: { restaurantId: user.restaurantId, deletedAt: null },
      select: { id: true, name: true, phone: true, email: true },
      orderBy: { name: "asc" },
      take: 300,
    }),
  ]);

  return (
    <PageShell>
      <PageHeader
        title="Reservations"
        description="Bookings across the floor. A table can't be double-booked for overlapping times."
      />
      <ReservationsView
        reservations={reservations.map((r) => ({
          id: r.id,
          guestName: r.guestName,
          guestPhone: r.guestPhone,
          guestEmail: r.guestEmail,
          reservedAt: r.reservedAt,
          durationMin: r.durationMin,
          guests: r.guests,
          status: r.status,
          notes: r.notes,
          customerId: r.customerId,
          tableId: r.tableId,
          tableNumber: r.table?.number ?? null,
          tableZone: r.table?.zone ?? null,
        }))}
        tables={tables.map((t) => ({
          id: t.id,
          number: t.number,
          capacity: t.capacity,
          zone: t.zone,
        }))}
        customers={customers}
        canManage={user.permissions.includes(PERMISSIONS.RESERVATIONS_MANAGE)}
        filters={{ status, date: date ?? "", search: search ?? "" }}
      />
    </PageShell>
  );
}
