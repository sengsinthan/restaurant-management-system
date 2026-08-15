import "server-only";

import { forbidden } from "next/navigation";

import type { PermissionKey } from "@/lib/permissions";
import { getSession, requireUser, type SessionUser } from "./session";

export class AuthorizationError extends Error {
  constructor(permission: PermissionKey) {
    super(`Missing permission: ${permission}`);
    this.name = "AuthorizationError";
  }
}

export function can(user: SessionUser | null, permission: PermissionKey): boolean {
  return !!user && user.permissions.includes(permission);
}

export function canAny(user: SessionUser | null, permissions: PermissionKey[]): boolean {
  return !!user && permissions.some((p) => user.permissions.includes(p));
}

/**
 * Page-level guard. Renders the 403 boundary rather than throwing so a user
 * who follows a bookmarked link to a screen they lost access to gets a
 * readable page instead of a crash.
 */
export async function requirePermission(permission: PermissionKey): Promise<SessionUser> {
  const user = await requireUser();
  if (!user.permissions.includes(permission)) forbidden();
  return user;
}

/**
 * Action-level guard. Throws so the calling server action can convert the
 * failure into a form error. Never trust the client to have hidden the button.
 */
export async function authorize(permission: PermissionKey): Promise<SessionUser> {
  const user = await getSession();
  if (!user) throw new AuthorizationError(permission);
  if (!user.permissions.includes(permission)) throw new AuthorizationError(permission);
  return user;
}
