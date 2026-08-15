"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Search, X } from "lucide-react";

import { AppSelect } from "@/components/shared/app-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ORDER_STATUS_LABEL,
  ORDER_TYPE_LABEL,
  PAYMENT_STATUS_LABEL,
} from "@/lib/status";

const STATUS_OPTIONS = [
  { value: "ALL", label: "All statuses" },
  ...Object.entries(ORDER_STATUS_LABEL).map(([value, label]) => ({ value, label })),
];
const TYPE_OPTIONS = [
  { value: "ALL", label: "All types" },
  ...Object.entries(ORDER_TYPE_LABEL).map(([value, label]) => ({ value, label })),
];
const PAYMENT_OPTIONS = [
  { value: "ALL", label: "All payments" },
  ...Object.entries(PAYMENT_STATUS_LABEL).map(([value, label]) => ({ value, label })),
];

export function OrderFiltersBar({
  tables,
  status,
  type,
  payment,
  table,
  search,
  date,
}: {
  tables: { id: string; number: string }[];
  status: string;
  type: string;
  payment: string;
  table: string;
  search: string;
  date: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const [term, setTerm] = useState(search);

  const push = (patch: Record<string, string>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (!value || value === "ALL") params.delete(key);
      else params.set(key, value);
    }
    params.delete("page");
    startTransition(() => router.push(`/orders?${params.toString()}`, { scroll: false }));
  };

  // Debounce the free-text search so typing doesn't fire a request per key.
  useEffect(() => {
    if (term === search) return;
    const handle = setTimeout(() => push({ q: term }), 350);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [term]);

  const tableOptions = [
    { value: "ALL", label: "All tables" },
    ...tables.map((t) => ({ value: t.id, label: `Table ${t.number}` })),
  ];

  const hasFilters =
    status !== "ALL" || type !== "ALL" || payment !== "ALL" || table !== "ALL" || !!search || !!date;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-[13rem] flex-1 sm:max-w-xs">
        <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Order number, customer, table…"
          className="h-8 pl-9"
        />
      </div>

      <div className="w-36">
        <AppSelect
          value={status}
          onValueChange={(v) => push({ status: v })}
          options={STATUS_OPTIONS}
          size="sm"
          aria-label="Filter by status"
        />
      </div>
      <div className="w-32">
        <AppSelect
          value={type}
          onValueChange={(v) => push({ type: v })}
          options={TYPE_OPTIONS}
          size="sm"
          aria-label="Filter by order type"
        />
      </div>
      <div className="w-36">
        <AppSelect
          value={payment}
          onValueChange={(v) => push({ payment: v })}
          options={PAYMENT_OPTIONS}
          size="sm"
          aria-label="Filter by payment status"
        />
      </div>
      <div className="w-32">
        <AppSelect
          value={table}
          onValueChange={(v) => push({ table: v })}
          options={tableOptions}
          size="sm"
          aria-label="Filter by table"
        />
      </div>

      <Input
        type="date"
        value={date}
        onChange={(e) => push({ date: e.target.value })}
        className="h-8 w-[9.5rem]"
        aria-label="Filter by date"
      />

      {hasFilters && (
        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-1.5 text-xs"
          onClick={() => {
            setTerm("");
            startTransition(() => router.push("/orders", { scroll: false }));
          }}
        >
          <X className="size-3.5" />
          Clear
        </Button>
      )}
    </div>
  );
}
