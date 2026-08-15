"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { PERMISSIONS } from "@/lib/permissions";
import { authorize } from "@/server/auth/rbac";
import { writeAudit } from "@/server/audit";
import { hashPassword } from "@/server/auth/session";
import { run, type ActionResult } from "./result";

const staffSchema = z.object({
  name: z.string().trim().min(2, "Enter the staff member's name").max(120),
  email: z.string().trim().toLowerCase().email("Enter a valid email").max(160),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  roleId: z.string().uuid("Choose a role"),
  status: z.enum(["ACTIVE", "INACTIVE", "SUSPENDED"]),
  hireDate: z.string().optional().or(z.literal("")),
  password: z.string().min(8, "Passwords must be at least 8 characters").max(72).optional().or(z.literal("")),
});

export async function saveStaffAction(
  id: string | null,
  input: z.input<typeof staffSchema>,
): Promise<ActionResult> {
  return run(async () => {
    const user = await authorize(PERMISSIONS.STAFF_MANAGE);
    const data = staffSchema.parse(input);

    const duplicate = await prisma.user.findFirst({
      where: { email: data.email, ...(id ? { id: { not: id } } : {}) },
    });
    if (duplicate) throw new Error("That email address is already in use.");

    const hireDate = data.hireDate ? new Date(data.hireDate) : null;

    if (id) {
      const previous = await prisma.user.findFirstOrThrow({
        where: { id, restaurantId: user.restaurantId, deletedAt: null },
        include: { role: true },
      });

      // Never let the last active admin lock everyone out of the system.
      if (previous.role.name === "ADMIN" && (data.status !== "ACTIVE" || data.roleId !== previous.roleId)) {
        const activeAdmins = await prisma.user.count({
          where: {
            restaurantId: user.restaurantId,
            deletedAt: null,
            status: "ACTIVE",
            role: { name: "ADMIN" },
          },
        });
        if (activeAdmins <= 1) {
          throw new Error("This is the last active admin — promote someone else first.");
        }
      }

      await prisma.user.update({
        where: { id },
        data: {
          name: data.name,
          email: data.email,
          phone: data.phone || null,
          roleId: data.roleId,
          status: data.status,
          hireDate,
          ...(data.password ? { passwordHash: await hashPassword(data.password) } : {}),
        },
      });

      await writeAudit(user, {
        action: "UPDATE",
        entity: "User",
        entityId: id,
        previousValue: { name: previous.name, role: previous.role.name, status: previous.status },
        newValue: { name: data.name, status: data.status, passwordChanged: !!data.password },
        description: `Updated staff member ${data.name}`,
      });
    } else {
      if (!data.password) throw new Error("Set a starting password for the new account.");

      const created = await prisma.user.create({
        data: {
          restaurantId: user.restaurantId,
          name: data.name,
          email: data.email,
          phone: data.phone || null,
          roleId: data.roleId,
          status: data.status,
          hireDate,
          passwordHash: await hashPassword(data.password),
        },
      });

      await writeAudit(user, {
        action: "CREATE",
        entity: "User",
        entityId: created.id,
        newValue: { name: data.name, email: data.email },
        description: `Added staff member ${data.name}`,
      });
    }

    revalidatePath("/staff");
    return undefined;
  });
}

export async function deleteStaffAction(id: string): Promise<ActionResult> {
  return run(async () => {
    const user = await authorize(PERMISSIONS.STAFF_MANAGE);
    if (id === user.id) throw new Error("You can't remove your own account.");

    const target = await prisma.user.findFirstOrThrow({
      where: { id, restaurantId: user.restaurantId, deletedAt: null },
      include: { role: true },
    });

    if (target.role.name === "ADMIN") {
      const activeAdmins = await prisma.user.count({
        where: {
          restaurantId: user.restaurantId,
          deletedAt: null,
          status: "ACTIVE",
          role: { name: "ADMIN" },
        },
      });
      if (activeAdmins <= 1) throw new Error("This is the last active admin.");
    }

    // Soft delete keeps their historical orders and payments attributable.
    await prisma.user.update({
      where: { id },
      data: { deletedAt: new Date(), status: "INACTIVE" },
    });

    await writeAudit(user, {
      action: "DELETE",
      entity: "User",
      entityId: id,
      previousValue: { name: target.name, email: target.email },
      description: `Removed staff member ${target.name}`,
    });

    revalidatePath("/staff");
    return undefined;
  });
}

const profileSchema = z.object({
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
});

export async function updateProfileAction(
  input: z.input<typeof profileSchema>,
): Promise<ActionResult> {
  return run(async () => {
    const { getSession } = await import("@/server/auth/session");
    const session = await getSession();
    if (!session) throw new Error("You are not signed in.");
    const data = profileSchema.parse(input);

    await prisma.user.update({
      where: { id: session.id },
      data: { name: data.name, phone: data.phone || null },
    });

    revalidatePath("/settings/profile");
    revalidatePath("/", "layout");
    return undefined;
  });
}

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password"),
    newPassword: z.string().min(8, "New password must be at least 8 characters").max(72),
    confirmPassword: z.string(),
  })
  .refine((value) => value.newPassword === value.confirmPassword, {
    message: "The new passwords don't match",
    path: ["confirmPassword"],
  });

export async function changePasswordAction(
  input: z.input<typeof passwordSchema>,
): Promise<ActionResult> {
  return run(async () => {
    const { getSession, verifyPassword } = await import("@/server/auth/session");
    const session = await getSession();
    if (!session) throw new Error("You are not signed in.");
    const data = passwordSchema.parse(input);

    const account = await prisma.user.findUniqueOrThrow({ where: { id: session.id } });
    const valid = await verifyPassword(data.currentPassword, account.passwordHash);
    if (!valid) throw new Error("Your current password is not correct.");

    await prisma.user.update({
      where: { id: session.id },
      data: { passwordHash: await hashPassword(data.newPassword) },
    });

    await writeAudit(session, {
      action: "PASSWORD_CHANGE",
      entity: "User",
      entityId: session.id,
      description: `${session.name} changed their password`,
    });

    return undefined;
  });
}
