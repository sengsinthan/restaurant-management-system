import { redirect } from "next/navigation";

import { AppHeader } from "@/components/layout/app-header";
import { RealtimeProvider } from "@/components/layout/realtime-provider";
import { SidebarNav } from "@/components/layout/sidebar-nav";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/server/auth/session";
import { getNotifications } from "@/server/services/notifications";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await getSession();
  if (!user) redirect("/login");

  const [restaurant, branches, notifications] = await Promise.all([
    prisma.restaurant.findUnique({ where: { id: user.restaurantId } }),
    prisma.restaurant.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    getNotifications(user.restaurantId),
  ]);

  const restaurantName = restaurant?.name ?? "Restaurant";

  return (
    <div className="flex min-h-svh w-full">
      <aside className="sticky top-0 hidden h-svh w-64 shrink-0 border-r bg-sidebar lg:block">
        <SidebarNav permissions={user.permissions} restaurantName={restaurantName} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <AppHeader
          user={{
            name: user.name,
            email: user.email,
            roleLabel: user.roleLabel,
            avatarUrl: user.avatarUrl,
            permissions: user.permissions,
          }}
          restaurantName={restaurantName}
          branches={branches}
          notifications={notifications.items}
          unreadCount={notifications.unread}
        />
        <main className="min-w-0 flex-1">{children}</main>
      </div>

      <RealtimeProvider />
    </div>
  );
}
