"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export type SelectOption = { value: string; label: string; disabled?: boolean };

/**
 * Thin wrapper over the Base UI select so every call site gets label
 * rendering (via `items`) without repeating the plumbing.
 */
export function AppSelect({
  value,
  onValueChange,
  options,
  placeholder = "Select…",
  className,
  contentClassName,
  size = "default",
  name,
  disabled,
  "aria-label": ariaLabel,
}: {
  value: string;
  onValueChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  className?: string;
  contentClassName?: string;
  size?: "sm" | "default";
  name?: string;
  disabled?: boolean;
  "aria-label"?: string;
}) {
  return (
    <Select
      items={options}
      value={value}
      onValueChange={(next) => onValueChange(String(next))}
      name={name}
      disabled={disabled}
    >
      <SelectTrigger size={size} className={cn("w-full", className)} aria-label={ariaLabel}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className={contentClassName}>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
