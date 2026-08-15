"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { PERMISSIONS } from "@/lib/permissions";
import { authorize } from "@/server/auth/rbac";
import { writeAudit } from "@/server/audit";
import { searchCustomers } from "@/server/services/customers";
import { run, type ActionResult } from "./result";

const customerSchema = z.object({
  name: z.string().trim().min(2, "Enter the customer's name").max(120),
  phone: z.string().trim().min(5, "Enter a contact number").max(40),
  email: z.string().trim().email("Enter a valid email").max(160).optional().or(z.literal("")),
  address: z.string().trim().max(300).optional().or(z.literal("")),
  notes: z.string().trim().max(500).optional().or(z.literal("")),
});

export type CustomerRecord = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  address: string | null;
};

export async function searchCustomersAction(query: string): Promise<CustomerRecord[]> {
  const user = await authorize(PERMISSIONS.CUSTOMERS_VIEW);
  return searchCustomers(user.restaurantId, query);
}

export async function createCustomerAction(
  input: z.input<typeof customerSchema>,
): Promise<ActionResult<CustomerRecord>> {
  return run(async () => {
    const user = await authorize(PERMISSIONS.CUSTOMERS_MANAGE);
    const data = customerSchema.parse(input);

    const existing = await prisma.customer.findFirst({
      where: { restaurantId: user.restaurantId, phone: data.phone, deletedAt: null },
    });
    if (existing) {
      throw new Error(`${existing.name} is already registered with that phone number.`);
    }

    const customer = await prisma.customer.create({
      data: {
        restaurantId: user.restaurantId,
        name: data.name,
        phone: data.phone,
        email: data.email || null,
        address: data.address || null,
        notes: data.notes || null,
      },
    });

    await writeAudit(user, {
      action: "CREATE",
      entity: "Customer",
      entityId: customer.id,
      newValue: { name: customer.name, phone: customer.phone },
      description: `Added customer ${customer.name}`,
    });

    revalidatePath("/customers");
    return {
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      email: customer.email,
      address: customer.address,
    };
  });
}

export async function updateCustomerAction(
  id: string,
  input: z.input<typeof customerSchema>,
): Promise<ActionResult> {
  return run(async () => {
    const user = await authorize(PERMISSIONS.CUSTOMERS_MANAGE);
    const data = customerSchema.parse(input);

    const previous = await prisma.customer.findFirstOrThrow({
      where: { id, restaurantId: user.restaurantId, deletedAt: null },
    });

    await prisma.customer.update({
      where: { id },
      data: {
        name: data.name,
        phone: data.phone,
        email: data.email || null,
        address: data.address || null,
        notes: data.notes || null,
      },
    });

    await writeAudit(user, {
      action: "UPDATE",
      entity: "Customer",
      entityId: id,
      previousValue: { name: previous.name, phone: previous.phone, email: previous.email },
      newValue: { name: data.name, phone: data.phone, email: data.email || null },
      description: `Updated customer ${data.name}`,
    });

    revalidatePath("/customers");
    revalidatePath(`/customers/${id}`);
    return undefined;
  });
}

export async function deleteCustomerAction(id: string): Promise<ActionResult> {
  return run(async () => {
    const user = await authorize(PERMISSIONS.CUSTOMERS_MANAGE);
    const customer = await prisma.customer.findFirstOrThrow({
      where: { id, restaurantId: user.restaurantId, deletedAt: null },
    });

    // Soft delete keeps historical orders attributable.
    await prisma.customer.update({ where: { id }, data: { deletedAt: new Date() } });

    await writeAudit(user, {
      action: "DELETE",
      entity: "Customer",
      entityId: id,
      previousValue: { name: customer.name, phone: customer.phone },
      description: `Removed customer ${customer.name}`,
    });

    revalidatePath("/customers");
    return undefined;
  });
}
