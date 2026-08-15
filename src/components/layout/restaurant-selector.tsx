"use client";

import { Check, ChevronsUpDown, Store } from "lucide-react";
import { toast } from "sonner";

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

/**
 * Branch switcher. The data model is already multi-branch (every row is
 * scoped by `restaurant_id`), so adding a second location is a data change
 * rather than a schema change.
 */
export function RestaurantSelector({
  current,
  branches,
}: {
  current: string;
  branches: { id: string; name: string }[];
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" className="h-9 gap-2 px-2 font-medium">
            <Store className="size-4 text-primary" />
            <span className="max-w-[10rem] truncate">{current}</span>
            <ChevronsUpDown className="size-3.5 text-muted-foreground" />
          </Button>
        }
      />
      <DropdownMenuContent align="start" className="w-60">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Branches</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {branches.map((branch) => (
            <DropdownMenuItem
              key={branch.id}
              onClick={() => {
                if (branch.name !== current) {
                  toast.info("Single-branch deployment", {
                    description: "Add another restaurant row to enable branch switching.",
                  });
                }
              }}
            >
              <span className="flex-1 truncate">{branch.name}</span>
              {branch.name === current && <Check className="size-4 text-primary" />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
