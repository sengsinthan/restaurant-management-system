"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/server/audit";
import { createSession, destroySession, getSession, verifyPassword } from "./session";

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  password: z.string().min(1, "Enter your password"),
});

export type LoginState = { error?: string };

export async function loginAction(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid credentials" };
  }

  const user = await prisma.user.findFirst({
    where: { email: parsed.data.email, deletedAt: null },
  });

  // Same message for "no such user" and "wrong password" so the form cannot
  // be used to enumerate staff accounts.
  const genericError = { error: "Incorrect email or password" };
  if (!user) return genericError;

  const valid = await verifyPassword(parsed.data.password, user.passwordHash);
  if (!valid) return genericError;

  if (user.status !== "ACTIVE") {
    return { error: "This account is not active. Contact your manager." };
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });
  await createSession(user.id);
  await writeAudit(user, {
    action: "LOGIN",
    entity: "User",
    entityId: user.id,
    description: `${user.name} signed in`,
  });

  redirect("/dashboard");
}

export async function logoutAction(): Promise<void> {
  const session = await getSession();
  if (session) {
    await writeAudit(session, {
      action: "LOGOUT",
      entity: "User",
      entityId: session.id,
      description: `${session.name} signed out`,
    });
  }
  await destroySession();
  redirect("/login");
}
