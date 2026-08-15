"use client";

import { useEffect, useState, useTransition } from "react";
import { Check, Loader2, Plus, Search, UserRound, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createCustomerAction,
  searchCustomersAction,
  type CustomerRecord,
} from "@/server/actions/customers";

export function CustomerPicker({
  value,
  onChange,
  canCreate,
}: {
  value: CustomerRecord | null;
  onChange: (customer: CustomerRecord | null) => void;
  canCreate: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CustomerRecord[]>([]);
  const [searching, startSearch] = useTransition();
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", email: "" });
  const [saving, startSave] = useTransition();

  useEffect(() => {
    if (!open) return;
    const handle = setTimeout(() => {
      startSearch(async () => {
        setResults(await searchCustomersAction(query));
      });
    }, 220);
    return () => clearTimeout(handle);
  }, [query, open]);

  if (value) {
    return (
      <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-2.5 py-2">
        <UserRound className="size-4 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{value.name}</p>
          <p className="truncate text-xs text-muted-foreground">{value.phone}</p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="size-7 shrink-0"
          onClick={() => onChange(null)}
          aria-label="Remove customer"
        >
          <X className="size-4" />
        </Button>
      </div>
    );
  }

  return (
    <>
      <Button
        variant="outline"
        className="w-full justify-start gap-2 font-normal text-muted-foreground"
        onClick={() => setOpen(true)}
      >
        <Search className="size-4" />
        Find or add a customer
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{creating ? "New customer" : "Select customer"}</DialogTitle>
          </DialogHeader>

          {creating ? (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="cust-name">Name</Label>
                <Input
                  id="cust-name"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Jane Doe"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cust-phone">Phone</Label>
                <Input
                  id="cust-phone"
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  placeholder="+1 555 0100"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cust-email">Email (optional)</Label>
                <Input
                  id="cust-email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  placeholder="jane@example.com"
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setCreating(false)} disabled={saving}>
                  Back
                </Button>
                <Button
                  disabled={saving}
                  onClick={() =>
                    startSave(async () => {
                      const result = await createCustomerAction(form);
                      if (!result.ok) {
                        toast.error(result.error);
                        return;
                      }
                      onChange(result.data);
                      toast.success(`${result.data.name} added`);
                      setCreating(false);
                      setOpen(false);
                      setForm({ name: "", phone: "", email: "" });
                    })
                  }
                >
                  {saving && <Loader2 className="size-4 animate-spin" />}
                  Save customer
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="relative">
                <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search by name or phone…"
                  className="pl-9"
                />
                {searching && (
                  <Loader2 className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
                )}
              </div>

              <div className="max-h-64 space-y-1 overflow-y-auto">
                {results.length === 0 ? (
                  <p className="px-1 py-6 text-center text-sm text-muted-foreground">
                    {query ? "No matching customers." : "Start typing to search."}
                  </p>
                ) : (
                  results.map((customer) => (
                    <button
                      key={customer.id}
                      type="button"
                      onClick={() => {
                        onChange(customer);
                        setOpen(false);
                        setQuery("");
                      }}
                      className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-muted"
                    >
                      <span className="flex size-8 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                        {customer.name.slice(0, 2).toUpperCase()}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{customer.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {customer.phone}
                        </span>
                      </span>
                      <Check className="size-4 shrink-0 text-muted-foreground opacity-0" />
                    </button>
                  ))
                )}
              </div>

              {canCreate && (
                <Button variant="outline" className="w-full gap-2" onClick={() => setCreating(true)}>
                  <Plus className="size-4" />
                  New customer
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
