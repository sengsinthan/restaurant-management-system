"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { PERMISSIONS } from "@/lib/permissions";
import { authorize } from "@/server/auth/rbac";
import { writeAudit } from "@/server/audit";
import { publish } from "@/server/events";
import {
  createReservation,
  deleteReservation,
  setReservationStatus,
  updateReservation,
} from "@/server/services/reservations";
import { run, type ActionResult } from "./result";

const reservationSchema = z.object({
  customerId: z.string().uuid().nullable().optional(),
  tableId: z.string().uuid().nullable().optional(),
  guestName: z.string().trim().min(2, "Enter the guest's name").max(120),
  guestPhone: z.string().trim().min(5, "Enter a contact number").max(40),
  guestEmail: z.string().trim().email("Enter a valid email").max(160).optional().or(z.literal("")),
  date: z.string().min(1, "Choose a date"),
  time: z.string().min(1, "Choose a time"),
  durationMin: z.coerce.number().int().min(15).max(480),
  guests: z.coerce.number().int().min(1).max(50),
  status: z.enum(["PENDING", "CONFIRMED", "SEATED", "COMPLETED", "CANCELLED", "NO_SHOW"]),
  notes: z.string().trim().max(500).optional().or(z.literal("")),
});

function revalidateReservations() {
  for (const path of ["/reservations", "/tables", "/dashboard"]) revalidatePath(path);
}

export async function saveReservationAction(
  id: string | null,
  input: z.input<typeof reservationSchema>,
): Promise<ActionResult> {
  return run(async () => {
    const user = await authorize(PERMISSIONS.RESERVATIONS_MANAGE);
    const data = reservationSchema.parse(input);

    const reservedAt = new Date(`${data.date}T${data.time}`);
    if (Number.isNaN(reservedAt.getTime())) throw new Error("That date and time is not valid.");

    const payload = {
      restaurantId: user.restaurantId,
      customerId: data.customerId ?? null,
      tableId: data.tableId ?? null,
      guestName: data.guestName,
      guestPhone: data.guestPhone,
      guestEmail: data.guestEmail || null,
      reservedAt,
      durationMin: data.durationMin,
      guests: data.guests,
      status: data.status,
      notes: data.notes || null,
    };

    const reservation = id
      ? await updateReservation(id, user.restaurantId, payload)
      : await createReservation(payload);

    await writeAudit(user, {
      action: id ? "UPDATE" : "CREATE",
      entity: "Reservation",
      entityId: reservation.id,
      newValue: {
        guest: data.guestName,
        reservedAt: reservedAt.toISOString(),
        guests: data.guests,
        status: data.status,
      },
      description: `${id ? "Updated" : "Created"} reservation for ${data.guestName}`,
    });

    publish("reservation.updated", user.restaurantId, reservation.id);
    publish("table.updated", user.restaurantId);
    revalidateReservations();
    return undefined;
  });
}

export async function setReservationStatusAction(
  id: string,
  status: "PENDING" | "CONFIRMED" | "SEATED" | "COMPLETED" | "CANCELLED" | "NO_SHOW",
): Promise<ActionResult> {
  return run(async () => {
    const user = await authorize(PERMISSIONS.RESERVATIONS_MANAGE);
    const reservation = await setReservationStatus(id, user.restaurantId, status);

    await writeAudit(user, {
      action: "STATUS_CHANGE",
      entity: "Reservation",
      entityId: id,
      newValue: { status },
      description: `Reservation for ${reservation.guestName} set to ${status}`,
    });

    publish("reservation.updated", user.restaurantId, id);
    publish("table.updated", user.restaurantId);
    revalidateReservations();
    return undefined;
  });
}

export async function deleteReservationAction(id: string): Promise<ActionResult> {
  return run(async () => {
    const user = await authorize(PERMISSIONS.RESERVATIONS_MANAGE);
    const reservation = await deleteReservation(id, user.restaurantId);

    await writeAudit(user, {
      action: "DELETE",
      entity: "Reservation",
      entityId: id,
      previousValue: { guest: reservation.guestName },
      description: `Deleted reservation for ${reservation.guestName}`,
    });

    publish("reservation.updated", user.restaurantId, id);
    revalidateReservations();
    return undefined;
  });
}
