"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { PERMISSIONS } from "@/lib/permissions";
import { authorize } from "@/server/auth/rbac";
import { writeAudit } from "@/server/audit";
import { publish } from "@/server/events";
import {
  markTableAvailable,
  mergeTables,
  setTableStatus,
  splitMergedTable,
  transferTable,
} from "@/server/services/tables";
import { run, type ActionResult } from "./result";

const tableSchema = z.object({
  number: z.string().trim().min(1, "Enter a table number").max(20),
  name: z.string().trim().max(60).optional().or(z.literal("")),
  capacity: z.coerce.number().int().min(1).max(50),
  zone: z.string().trim().min(1).max(60),
  status: z.enum(["AVAILABLE", "OCCUPIED", "RESERVED", "CLEANING", "OUT_OF_SERVICE"]),
});

function revalidateTables() {
  for (const path of ["/tables", "/pos", "/dashboard", "/reservations"]) revalidatePath(path);
}

export async function setTableStatusAction(
  tableId: string,
  status: "AVAILABLE" | "OCCUPIED" | "RESERVED" | "CLEANING" | "OUT_OF_SERVICE",
): Promise<ActionResult> {
  return run(async () => {
    const user = await authorize(PERMISSIONS.TABLES_MANAGE);
    const table = await prisma.restaurantTable.findFirstOrThrow({
      where: { id: tableId, restaurantId: user.restaurantId },
    });

    if (status === "AVAILABLE") await markTableAvailable(tableId);
    else await setTableStatus(tableId, status);

    await writeAudit(user, {
      action: "STATUS_CHANGE",
      entity: "Table",
      entityId: tableId,
      previousValue: { status: table.status },
      newValue: { status },
      description: `Table ${table.number} set to ${status}`,
    });

    publish("table.updated", user.restaurantId, tableId);
    revalidateTables();
    return undefined;
  });
}

export async function transferTableAction(
  fromTableId: string,
  toTableId: string,
): Promise<ActionResult<{ from: string; to: string }>> {
  return run(async () => {
    const user = await authorize(PERMISSIONS.TABLES_MANAGE);
    const result = await transferTable(fromTableId, toTableId);

    await writeAudit(user, {
      action: "TRANSFER",
      entity: "Table",
      entityId: fromTableId,
      previousValue: { table: result.from },
      newValue: { table: result.to, ordersMoved: result.moved },
      description: `Moved ${result.moved} order(s) from table ${result.from} to ${result.to}`,
    });

    publish("table.updated", user.restaurantId);
    publish("order.updated", user.restaurantId);
    revalidateTables();
    return { from: result.from, to: result.to };
  });
}

export async function mergeTablesAction(
  primaryId: string,
  secondaryIds: string[],
): Promise<ActionResult<{ primary: string; merged: string[]; capacity: number }>> {
  return run(async () => {
    const user = await authorize(PERMISSIONS.TABLES_MANAGE);
    const result = await mergeTables(primaryId, secondaryIds);

    await writeAudit(user, {
      action: "MERGE",
      entity: "Table",
      entityId: primaryId,
      newValue: { primary: result.primary, merged: result.merged, capacity: result.capacity },
      description: `Merged tables ${result.merged.join(", ")} into ${result.primary}`,
    });

    publish("table.updated", user.restaurantId);
    revalidateTables();
    return result;
  });
}

export async function splitTablesAction(primaryId: string): Promise<ActionResult> {
  return run(async () => {
    const user = await authorize(PERMISSIONS.TABLES_MANAGE);
    const result = await splitMergedTable(primaryId);

    await writeAudit(user, {
      action: "SPLIT",
      entity: "Table",
      entityId: primaryId,
      newValue: { released: result.count },
      description: `Split ${result.count} merged table(s)`,
    });

    publish("table.updated", user.restaurantId);
    revalidateTables();
    return undefined;
  });
}

export async function saveTableAction(
  id: string | null,
  input: z.input<typeof tableSchema>,
): Promise<ActionResult> {
  return run(async () => {
    const user = await authorize(PERMISSIONS.TABLES_MANAGE);
    const data = tableSchema.parse(input);

    if (id) {
      const previous = await prisma.restaurantTable.findFirstOrThrow({
        where: { id, restaurantId: user.restaurantId },
      });
      await prisma.restaurantTable.update({
        where: { id },
        data: {
          number: data.number,
          name: data.name || null,
          capacity: data.capacity,
          zone: data.zone,
          status: data.status,
        },
      });
      await writeAudit(user, {
        action: "UPDATE",
        entity: "Table",
        entityId: id,
        previousValue: { number: previous.number, capacity: previous.capacity, zone: previous.zone },
        newValue: { number: data.number, capacity: data.capacity, zone: data.zone },
        description: `Updated table ${data.number}`,
      });
    } else {
      const created = await prisma.restaurantTable.create({
        data: {
          restaurantId: user.restaurantId,
          number: data.number,
          name: data.name || null,
          capacity: data.capacity,
          zone: data.zone,
          status: data.status,
        },
      });
      await writeAudit(user, {
        action: "CREATE",
        entity: "Table",
        entityId: created.id,
        newValue: { number: data.number, capacity: data.capacity, zone: data.zone },
        description: `Added table ${data.number}`,
      });
    }

    publish("table.updated", user.restaurantId);
    revalidateTables();
    return undefined;
  });
}

export async function deleteTableAction(id: string): Promise<ActionResult> {
  return run(async () => {
    const user = await authorize(PERMISSIONS.TABLES_MANAGE);
    const table = await prisma.restaurantTable.findFirstOrThrow({
      where: { id, restaurantId: user.restaurantId, deletedAt: null },
    });

    const openOrders = await prisma.order.count({
      where: { tableId: id, status: { notIn: ["COMPLETED", "CANCELLED"] } },
    });
    if (openOrders > 0) throw new Error("This table still has an open order.");

    await prisma.restaurantTable.update({
      where: { id },
      data: { deletedAt: new Date(), status: "OUT_OF_SERVICE" },
    });

    await writeAudit(user, {
      action: "DELETE",
      entity: "Table",
      entityId: id,
      previousValue: { number: table.number },
      description: `Removed table ${table.number}`,
    });

    publish("table.updated", user.restaurantId);
    revalidateTables();
    return undefined;
  });
}
