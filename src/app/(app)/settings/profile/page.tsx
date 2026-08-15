import type { Metadata } from "next";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/server/auth/session";

import { ProfileForm } from "./profile-form";

export const metadata: Metadata = { title: "My profile" };
export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const session = await requireUser();

  const account = await prisma.user.findUniqueOrThrow({
    where: { id: session.id },
    include: {
      role: {
        include: { permissions: { include: { permission: true } } },
      },
    },
  });

  const grouped = new Map<string, string[]>();
  for (const rp of account.role.permissions) {
    const list = grouped.get(rp.permission.group) ?? [];
    list.push(rp.permission.label);
    grouped.set(rp.permission.group, list);
  }

  return (
    <ProfileForm
      account={{
        name: account.name,
        email: account.email,
        phone: account.phone,
        roleLabel: account.role.label,
        hireDate: account.hireDate,
        lastLoginAt: account.lastLoginAt,
      }}
      permissionGroups={[...grouped.entries()].map(([group, labels]) => ({ group, labels }))}
    />
  );
}
