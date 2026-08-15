import "server-only";

import { headers } from "next/headers";

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import type { SessionUser } from "./auth/session";

export type AuditInput = {
  action: string;
  entity: string;
  entityId?: string | null;
  previousValue?: unknown;
  newValue?: unknown;
  description?: string;
};

type Client = Prisma.TransactionClient | typeof prisma;

/**
 * Writes an audit row. Accepts a transaction client so a business operation
 * and its audit trail commit together — an inventory adjustment that rolls
 * back must not leave an orphaned log entry claiming it happened.
 */
export async function writeAudit(
  user: Pick<SessionUser, "id" | "name">,
  input: AuditInput,
  client: Client = prisma,
): Promise<void> {
  let ip: string | null = null;
  try {
    const h = await headers();
    ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  } catch {
    // headers() is unavailable outside a request scope (e.g. seed) — fine.
  }

  await client.auditLog.create({
    data: {
      userId: user.id,
      userName: user.name,
      action: input.action,
      entity: input.entity,
      entityId: input.entityId ?? null,
      previousValue: (input.previousValue ?? undefined) as Prisma.InputJsonValue | undefined,
      newValue: (input.newValue ?? undefined) as Prisma.InputJsonValue | undefined,
      description: input.description ?? null,
      ipAddress: ip,
    },
  });
}
