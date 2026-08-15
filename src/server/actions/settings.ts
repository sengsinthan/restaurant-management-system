"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { PERMISSIONS } from "@/lib/permissions";
import { authorize } from "@/server/auth/rbac";
import { writeAudit } from "@/server/audit";
import { run, type ActionResult } from "./result";

const restaurantSchema = z.object({
  name: z.string().trim().min(2, "Enter the restaurant name").max(120),
  address: z.string().trim().max(300).optional().or(z.literal("")),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  email: z.string().trim().email("Enter a valid email").max(160).optional().or(z.literal("")),
  currency: z.string().trim().min(1).max(10),
  currencySymbol: z.string().trim().min(1).max(5),
  taxRate: z.coerce.number().min(0).max(100),
  serviceChargeRate: z.coerce.number().min(0).max(100),
  discountApprovalThreshold: z.coerce.number().min(0).max(100),
  openingTime: z.string().trim().max(10),
  closingTime: z.string().trim().max(10),
});

export async function updateRestaurantAction(
  input: z.input<typeof restaurantSchema>,
): Promise<ActionResult> {
  return run(async () => {
    const user = await authorize(PERMISSIONS.SETTINGS_MANAGE);
    const data = restaurantSchema.parse(input);

    const previous = await prisma.restaurant.findUniqueOrThrow({
      where: { id: user.restaurantId },
    });

    await prisma.restaurant.update({
      where: { id: user.restaurantId },
      data: {
        name: data.name,
        address: data.address || null,
        phone: data.phone || null,
        email: data.email || null,
        currency: data.currency,
        currencySymbol: data.currencySymbol,
        taxRate: data.taxRate,
        serviceChargeRate: data.serviceChargeRate,
        discountApprovalThreshold: data.discountApprovalThreshold,
        openingTime: data.openingTime,
        closingTime: data.closingTime,
      },
    });

    await writeAudit(user, {
      action: "UPDATE",
      entity: "Restaurant",
      entityId: user.restaurantId,
      previousValue: {
        name: previous.name,
        taxRate: Number(previous.taxRate),
        serviceChargeRate: Number(previous.serviceChargeRate),
        discountApprovalThreshold: Number(previous.discountApprovalThreshold),
      },
      newValue: {
        name: data.name,
        taxRate: data.taxRate,
        serviceChargeRate: data.serviceChargeRate,
        discountApprovalThreshold: data.discountApprovalThreshold,
      },
      description: "Updated restaurant settings",
    });

    revalidatePath("/", "layout");
    revalidatePath("/settings");
    return undefined;
  });
}

const discountSchema = z.object({
  code: z.string().trim().max(40).optional().or(z.literal("")),
  name: z.string().trim().min(2, "Enter a discount name").max(120),
  description: z.string().trim().max(300).optional().or(z.literal("")),
  type: z.enum(["PERCENTAGE", "FIXED"]),
  scope: z.enum(["MANUAL", "COUPON", "PROMOTION"]),
  value: z.coerce.number().min(0.01, "Enter a value above zero").max(100000),
  minOrderAmount: z.coerce.number().min(0).max(100000),
  maxDiscount: z.coerce.number().min(0).max(100000).optional(),
  startsAt: z.string().optional().or(z.literal("")),
  endsAt: z.string().optional().or(z.literal("")),
  usageLimit: z.coerce.number().int().min(0).max(1_000_000).optional(),
  isActive: z.boolean().default(true),
});

export async function saveDiscountAction(
  id: string | null,
  input: z.input<typeof discountSchema>,
): Promise<ActionResult> {
  return run(async () => {
    const user = await authorize(PERMISSIONS.DISCOUNTS_MANAGE);
    const data = discountSchema.parse(input);

    if (data.type === "PERCENTAGE" && data.value > 100) {
      throw new Error("A percentage discount cannot exceed 100%.");
    }

    const payload = {
      code: data.code ? data.code.toUpperCase() : null,
      name: data.name,
      description: data.description || null,
      type: data.type,
      scope: data.scope,
      value: data.value,
      minOrderAmount: data.minOrderAmount,
      maxDiscount: data.maxDiscount && data.maxDiscount > 0 ? data.maxDiscount : null,
      startsAt: data.startsAt ? new Date(data.startsAt) : null,
      endsAt: data.endsAt ? new Date(data.endsAt) : null,
      usageLimit: data.usageLimit && data.usageLimit > 0 ? data.usageLimit : null,
      isActive: data.isActive,
    };

    if (id) {
      await prisma.discount.findFirstOrThrow({
        where: { id, restaurantId: user.restaurantId, deletedAt: null },
      });
      await prisma.discount.update({ where: { id }, data: payload });
      await writeAudit(user, {
        action: "UPDATE",
        entity: "Discount",
        entityId: id,
        newValue: { name: data.name, value: data.value, type: data.type },
        description: `Updated discount ${data.name}`,
      });
    } else {
      const created = await prisma.discount.create({
        data: { ...payload, restaurantId: user.restaurantId },
      });
      await writeAudit(user, {
        action: "CREATE",
        entity: "Discount",
        entityId: created.id,
        newValue: { name: data.name, value: data.value, type: data.type },
        description: `Created discount ${data.name}`,
      });
    }

    revalidatePath("/settings/discounts");
    revalidatePath("/pos");
    return undefined;
  });
}

export async function deleteDiscountAction(id: string): Promise<ActionResult> {
  return run(async () => {
    const user = await authorize(PERMISSIONS.DISCOUNTS_MANAGE);
    const discount = await prisma.discount.findFirstOrThrow({
      where: { id, restaurantId: user.restaurantId, deletedAt: null },
    });

    // Soft delete: past orders reference this discount.
    await prisma.discount.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });

    await writeAudit(user, {
      action: "DELETE",
      entity: "Discount",
      entityId: id,
      previousValue: { name: discount.name },
      description: `Removed discount ${discount.name}`,
    });

    revalidatePath("/settings/discounts");
    revalidatePath("/pos");
    return undefined;
  });
}
