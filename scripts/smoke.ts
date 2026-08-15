/**
 * Dev smoke test: signs a session JWT for a demo user and fetches every route,
 * reporting HTTP status and any Next.js error markers in the HTML.
 */
import "dotenv/config";
import { SignJWT } from "jose";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const BASE = process.env.SMOKE_BASE ?? "http://localhost:3000";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const ROUTES = (process.env.SMOKE_ROUTES ?? "").split(",").filter(Boolean);

const DEFAULT_ROUTES = [
  "/dashboard",
  "/pos",
  "/orders",
  "/tables",
  "/kitchen",
  "/menu/categories",
  "/menu/items",
  "/inventory/ingredients",
  "/inventory/stock",
  "/inventory/suppliers",
  "/customers",
  "/reservations",
  "/payments",
  "/staff",
  "/reports",
  "/settings",
];

async function main() {
  const email = process.env.SMOKE_USER ?? "admin@example.com";
  const user = await prisma.user.findFirstOrThrow({ where: { email } });

  const token = await new SignJWT({ sub: user.id })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(process.env.AUTH_SECRET!));

  const routes = ROUTES.length > 0 ? ROUTES : DEFAULT_ROUTES;
  let failures = 0;

  for (const route of routes) {
    const started = Date.now();
    try {
      const response = await fetch(`${BASE}${route}`, {
        headers: { cookie: `rms_session=${token}` },
        redirect: "manual",
      });
      const ms = Date.now() - started;
      const body = response.status === 200 ? await response.text() : "";
      const errored =
        body.includes("__next_error__") ||
        body.includes("Application error: a server-side exception");
      const ok = response.status === 200 && !errored;
      if (!ok) failures++;
      console.log(
        `${ok ? "PASS" : "FAIL"}  ${String(response.status).padEnd(3)} ${String(ms).padStart(5)}ms  ${route}${
          errored ? "  <-- server exception in HTML" : ""
        }`,
      );
    } catch (error) {
      failures++;
      console.log(`FAIL  ERR        ${route}  ${(error as Error).message}`);
    }
  }

  console.log(`\n${routes.length - failures}/${routes.length} routes healthy (as ${email})`);
  if (failures > 0) process.exitCode = 1;
}

main().finally(() => prisma.$disconnect());
