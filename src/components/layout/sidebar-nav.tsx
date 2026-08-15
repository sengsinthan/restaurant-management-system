"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ChefHat, ChevronRight } from "lucide-react";

import { NAVIGATION, visibleNavigation } from "@/lib/navigation";
import type { PermissionKey } from "@/lib/permissions";
import { cn } from "@/lib/utils";

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SidebarNav({
  permissions,
  restaurantName,
  onNavigate,
}: {
  permissions: PermissionKey[];
  restaurantName: string;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const sections = visibleNavigation(permissions);
  const [open, setOpen] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      NAVIGATION.flatMap((s) => s.items)
        .filter((i) => i.children?.length)
        .map((i) => [i.href, isActive(pathname, i.href)]),
    ),
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-14 shrink-0 items-center gap-2.5 border-b px-4">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <ChefHat className="size-4.5" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold tracking-tight">{restaurantName}</p>
          <p className="truncate text-[11px] text-muted-foreground">Restaurant Manager</p>
        </div>
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
        {sections.map((section, index) => (
          <div key={section.label ?? `section-${index}`}>
            {section.label && (
              <p className="mb-1.5 px-2.5 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                {section.label}
              </p>
            )}
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const active = isActive(pathname, item.href);
                const hasChildren = !!item.children?.length;
                const expanded = open[item.href] ?? active;

                return (
                  <li key={item.href}>
                    <div className="flex items-center">
                      <Link
                        href={hasChildren ? (item.children![0].href ?? item.href) : item.href}
                        onClick={onNavigate}
                        className={cn(
                          "flex h-9 flex-1 items-center gap-2.5 rounded-lg px-2.5 text-sm font-medium transition-colors",
                          active
                            ? "bg-sidebar-accent text-sidebar-accent-foreground"
                            : "text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                        )}
                      >
                        <item.icon className={cn("size-4.5 shrink-0", active && "text-primary")} />
                        <span className="truncate">{item.title}</span>
                      </Link>
                      {hasChildren && (
                        <button
                          type="button"
                          onClick={() => setOpen((s) => ({ ...s, [item.href]: !expanded }))}
                          aria-label={expanded ? `Collapse ${item.title}` : `Expand ${item.title}`}
                          className="ml-0.5 flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-sidebar-accent/60 hover:text-foreground"
                        >
                          <ChevronRight
                            className={cn("size-4 transition-transform", expanded && "rotate-90")}
                          />
                        </button>
                      )}
                    </div>

                    {hasChildren && expanded && (
                      <ul className="mt-0.5 ml-5 space-y-0.5 border-l pl-2.5">
                        {item.children!.map((child) => {
                          const childActive = isActive(pathname, child.href);
                          return (
                            <li key={child.href}>
                              <Link
                                href={child.href}
                                onClick={onNavigate}
                                className={cn(
                                  "flex h-8 items-center gap-2 rounded-md px-2.5 text-[13px] transition-colors",
                                  childActive
                                    ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                                    : "text-sidebar-foreground/65 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                                )}
                              >
                                <child.icon className="size-4 shrink-0" />
                                <span className="truncate">{child.title}</span>
                              </Link>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </div>
  );
}
