"use client";

import Link from "next/link";
import { LogOut, Settings, UserRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { logoutAction } from "@/server/auth/actions";
import { PERMISSIONS, type PermissionKey } from "@/lib/permissions";

function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export function UserMenu({
  user,
}: {
  user: { name: string; email: string; roleLabel: string; avatarUrl: string | null; permissions: PermissionKey[] };
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" className="h-9 gap-2 px-1.5" aria-label="Account menu">
            <span className="flex size-7 items-center justify-center rounded-full bg-primary/12 text-[11px] font-semibold text-primary">
              {initials(user.name)}
            </span>
            <span className="hidden text-sm font-medium sm:inline">{user.name.split(" ")[0]}</span>
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="font-normal">
            <p className="text-sm font-medium">{user.name}</p>
            <p className="truncate text-xs text-muted-foreground">{user.email}</p>
            <p className="mt-1.5 inline-flex rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
              {user.roleLabel}
            </p>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem render={<Link href="/settings/profile" />}>
            <UserRound className="size-4" /> My profile
          </DropdownMenuItem>
          {user.permissions.includes(PERMISSIONS.SETTINGS_VIEW) && (
            <DropdownMenuItem render={<Link href="/settings" />}>
              <Settings className="size-4" /> Settings
            </DropdownMenuItem>
          )}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onClick={() => void logoutAction()}
        >
          <LogOut className="size-4" /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
