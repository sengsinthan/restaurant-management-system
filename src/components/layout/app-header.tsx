"use client";

import { useState } from "react";
import { Menu } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import type { PermissionKey } from "@/lib/permissions";
import type { Plain } from "@/lib/serialize";
import type { Notification } from "@/generated/prisma/client";

import { NotificationsMenu } from "./notifications-menu";
import { RestaurantSelector } from "./restaurant-selector";
import { SidebarNav } from "./sidebar-nav";
import { ThemeToggle } from "./theme-toggle";
import { UserMenu } from "./user-menu";

export function AppHeader({
  user,
  restaurantName,
  branches,
  notifications,
  unreadCount,
}: {
  user: { name: string; email: string; roleLabel: string; avatarUrl: string | null; permissions: PermissionKey[] };
  restaurantName: string;
  branches: { id: string; name: string }[];
  notifications: Plain<Notification>[];
  unreadCount: number;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b bg-background/85 px-3 backdrop-blur-md sm:px-4">
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetTrigger
          render={
            <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open navigation">
              <Menu className="size-5" />
            </Button>
          }
        />
        <SheetContent side="left" className="w-72 p-0">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SidebarNav
            permissions={user.permissions}
            restaurantName={restaurantName}
            onNavigate={() => setMobileOpen(false)}
          />
        </SheetContent>
      </Sheet>

      <RestaurantSelector current={restaurantName} branches={branches} />

      <div className="ml-auto flex items-center gap-1">
        <NotificationsMenu notifications={notifications} unreadCount={unreadCount} />
        <ThemeToggle />
        <UserMenu user={user} />
      </div>
    </header>
  );
}
