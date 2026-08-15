import type { Metadata } from "next";
import { ChefHat } from "lucide-react";

import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

const DEMO_ACCOUNTS = [
  { email: "admin@example.com", role: "Admin", scope: "Everything" },
  { email: "manager@example.com", role: "Manager", scope: "Dashboard, menu, inventory, reports" },
  { email: "cashier@example.com", role: "Cashier", scope: "POS, orders, payments" },
  { email: "waiter@example.com", role: "Waiter", scope: "Tables, POS, orders" },
  { email: "kitchen@example.com", role: "Kitchen", scope: "Kitchen display" },
];

export default function LoginPage() {
  return (
    <main className="flex min-h-svh flex-col lg:flex-row">
      <section className="flex flex-1 items-center justify-center px-5 py-10 sm:px-8">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2.5">
            <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <ChefHat className="size-5" />
            </span>
            <div>
              <p className="text-sm font-semibold tracking-tight">The Copper Spoon</p>
              <p className="text-xs text-muted-foreground">Restaurant Manager</p>
            </div>
          </div>

          <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Use your staff account to open your shift.
          </p>

          <LoginForm />
        </div>
      </section>

      <section className="border-t bg-sidebar px-5 py-10 sm:px-8 lg:w-[26rem] lg:border-t-0 lg:border-l lg:px-10">
        <div className="mx-auto max-w-sm lg:mt-24">
          <h2 className="text-sm font-semibold">Demo accounts</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Every account uses the password{" "}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">password123</code>.
            Pick a role to see how permissions change the sidebar and the screens.
          </p>
          <ul className="mt-4 space-y-2">
            {DEMO_ACCOUNTS.map((account) => (
              <li
                key={account.email}
                className="rounded-lg border bg-card px-3 py-2.5 text-xs shadow-xs"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[11px]">{account.email}</span>
                  <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 font-medium text-primary">
                    {account.role}
                  </span>
                </div>
                <p className="mt-1 text-muted-foreground">{account.scope}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </main>
  );
}
