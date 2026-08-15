import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";

import { prisma } from "@/lib/prisma";
import type { PermissionKey } from "@/lib/permissions";

const COOKIE_NAME = "rms_session";
const MAX_AGE_SECONDS = 60 * 60 * 12; // 12 hours — a long restaurant shift.

function secret(): Uint8Array {
  const value = process.env.AUTH_SECRET;
  if (!value || value.length < 32) {
    throw new Error("AUTH_SECRET must be set to at least 32 characters");
  }
  return new TextEncoder().encode(value);
}

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  role: string;
  roleLabel: string;
  restaurantId: string;
  permissions: PermissionKey[];
};

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function createSession(userId: string): Promise<void> {
  const token = await new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(secret());

  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

async function readUserId(): Promise<string | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

/**
 * Resolves the signed-in user together with the permission set granted by
 * their role. Cached per request so a page rendering a dozen server
 * components only hits the database once.
 */
export const getSession = cache(async (): Promise<SessionUser | null> => {
  const userId = await readUserId();
  if (!userId) return null;

  const user = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null, status: "ACTIVE" },
    include: { role: { include: { permissions: { include: { permission: true } } } } },
  });
  if (!user || !user.restaurantId) return null;

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    avatarUrl: user.avatarUrl,
    role: user.role.name,
    roleLabel: user.role.label,
    restaurantId: user.restaurantId,
    permissions: user.role.permissions.map((rp) => rp.permission.key as PermissionKey),
  };
});

/** Server-side gate for pages: redirects to login when unauthenticated. */
export async function requireUser(): Promise<SessionUser> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}
