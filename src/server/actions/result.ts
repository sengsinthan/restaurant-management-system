import "server-only";

import { AuthorizationError } from "@/server/auth/rbac";
import { BusinessRuleError } from "@/server/services/orders";
import { InventoryError } from "@/server/services/inventory";

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string };

/**
 * Wraps a server action body so expected failures (validation, business
 * rules, missing permissions) come back as readable messages the UI can show,
 * while genuinely unexpected errors are logged and reported generically
 * rather than leaking internals to the client.
 */
export async function run<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (error) {
    if (error instanceof BusinessRuleError || error instanceof InventoryError) {
      return { ok: false, error: error.message };
    }
    if (error instanceof AuthorizationError) {
      return { ok: false, error: "You don't have permission to do that." };
    }
    if (error && typeof error === "object" && "code" in error) {
      const code = (error as { code: string }).code;
      if (code === "P2002") return { ok: false, error: "That value is already in use." };
      if (code === "P2025") return { ok: false, error: "That record no longer exists." };
      if (code === "P2003") return { ok: false, error: "That record is still referenced elsewhere." };
    }
    console.error("[action]", error);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}
