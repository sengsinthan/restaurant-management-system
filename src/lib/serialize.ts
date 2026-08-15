import { Prisma } from "@/generated/prisma/client";

/**
 * Prisma returns `Decimal` objects for numeric columns. Those are class
 * instances and cannot cross the server/client component boundary, so every
 * service result is passed through `plain()` before it leaves `src/server`.
 * Decimals become numbers; Dates are left alone (Next serializes them).
 */
export type Plain<T> = T extends Prisma.Decimal
  ? number
  : T extends Date
    ? Date
    : T extends (infer U)[]
      ? Plain<U>[]
      : T extends object
        ? { [K in keyof T]: Plain<T[K]> }
        : T;

function isDecimal(value: unknown): value is Prisma.Decimal {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { toNumber?: unknown }).toNumber === "function" &&
    typeof (value as { toFixed?: unknown }).toFixed === "function" &&
    // Decimal.js instances carry these internals; guards against Date/other.
    "d" in (value as object) &&
    "s" in (value as object)
  );
}

export function plain<T>(value: T): Plain<T> {
  if (value === null || value === undefined) return value as Plain<T>;
  if (isDecimal(value)) return value.toNumber() as Plain<T>;
  if (value instanceof Date) return value as Plain<T>;
  if (Array.isArray(value)) return value.map((v) => plain(v)) as Plain<T>;
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      out[key] = plain(val);
    }
    return out as Plain<T>;
  }
  return value as Plain<T>;
}

/** Convert a Decimal | number | string to a plain number. */
export function num(value: Prisma.Decimal | number | string | null | undefined): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  return value.toNumber();
}
