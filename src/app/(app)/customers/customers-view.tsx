"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { Loader2, Pencil, Plus, Search, Trash2, UsersRound } from "lucide-react";
import { toast } from "sonner";

import { EmptyState } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { formatMoney } from "@/lib/money";
import {
  createCustomerAction,
  deleteCustomerAction,
  updateCustomerAction,
} from "@/server/actions/customers";

type Customer = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  address: string | null;
  notes: string | null;
  totalOrders: number;
  totalSpend: number;
  lastOrderAt: Date | string | null;
};

const EMPTY = { name: "", phone: "", email: "", address: "", notes: "" };

export function CustomersView({
  customers,
  currency,
  canManage,
  search,
}: {
  customers: Customer[];
  currency: string;
  canManage: boolean;
  search: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const [pending, startSave] = useTransition();
  const [term, setTerm] = useState(search);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [form, setForm] = useState(EMPTY);

  useEffect(() => {
    if (term === search) return;
    const handle = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (term) params.set("q", term);
      else params.delete("q");
      startTransition(() => router.push(`/customers?${params.toString()}`, { scroll: false }));
    }, 350);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [term]);

  const startCreate = () => {
    setForm(EMPTY);
    setEditing(null);
    setOpen(true);
  };

  const startEdit = (customer: Customer) => {
    setForm({
      name: customer.name,
      phone: customer.phone,
      email: customer.email ?? "",
      address: customer.address ?? "",
      notes: customer.notes ?? "",
    });
    setEditing(customer);
    setOpen(true);
  };

  const save = () =>
    startSave(async () => {
      const result = editing
        ? await updateCustomerAction(editing.id, form)
        : await createCustomerAction(form);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(editing ? "Customer updated" : "Customer added");
      setOpen(false);
      router.refresh();
    });

  const remove = (customer: Customer) =>
    startTransition(async () => {
      const result = await deleteCustomerAction(customer.id);
      if (!result.ok) toast.error(result.error);
      else {
        toast.success(`${customer.name} removed`);
        router.refresh();
      }
    });

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[13rem] flex-1 sm:max-w-xs">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Search name, phone or email…"
            className="h-8 pl-9"
          />
        </div>
        {canManage && (
          <Button className="ml-auto gap-2" onClick={startCreate}>
            <Plus className="size-4" />
            New customer
          </Button>
        )}
      </div>

      <Card className="py-0">
        <CardContent className="px-0">
          {customers.length === 0 ? (
            <EmptyState
              icon={UsersRound}
              title="No customers found"
              description="Guests added at the POS appear here automatically."
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Customer</TableHead>
                    <TableHead className="hidden md:table-cell">Contact</TableHead>
                    <TableHead className="hidden xl:table-cell">Address</TableHead>
                    <TableHead className="text-right">Orders</TableHead>
                    <TableHead className="text-right">Total spend</TableHead>
                    <TableHead className="hidden sm:table-cell">Last order</TableHead>
                    {canManage && <TableHead className="w-20" />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {customers.map((customer) => (
                    <TableRow key={customer.id} className="group">
                      <TableCell>
                        <Link
                          href={`/customers/${customer.id}`}
                          className="font-medium group-hover:text-primary group-hover:underline"
                        >
                          {customer.name}
                        </Link>
                        {customer.notes && (
                          <p className="max-w-48 truncate text-xs text-muted-foreground">
                            {customer.notes}
                          </p>
                        )}
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-muted-foreground">
                        <p>{customer.phone}</p>
                        {customer.email && (
                          <p className="truncate text-xs">{customer.email}</p>
                        )}
                      </TableCell>
                      <TableCell className="hidden max-w-56 truncate xl:table-cell text-muted-foreground">
                        {customer.address ?? "—"}
                      </TableCell>
                      <TableCell className="text-right tabular">{customer.totalOrders}</TableCell>
                      <TableCell className="text-right font-medium tabular">
                        {formatMoney(customer.totalSpend, currency)}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-muted-foreground">
                        {customer.lastOrderAt
                          ? formatDistanceToNow(new Date(customer.lastOrderAt), { addSuffix: true })
                          : "—"}
                      </TableCell>
                      {canManage && (
                        <TableCell>
                          <div className="flex justify-end gap-0.5">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-8"
                              onClick={() => startEdit(customer)}
                              aria-label={`Edit ${customer.name}`}
                            >
                              <Pencil className="size-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-8 text-muted-foreground hover:text-destructive"
                              onClick={() => remove(customer)}
                              aria-label={`Delete ${customer.name}`}
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? `Edit ${editing.name}` : "New customer"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="c-name">Name</Label>
              <Input
                id="c-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-phone">Phone</Label>
              <Input
                id="c-phone"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-email">Email</Label>
              <Input
                id="c-email"
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-address">Address</Label>
              <Input
                id="c-address"
                value={form.address}
                onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-notes">Notes</Label>
              <Textarea
                id="c-notes"
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                rows={2}
                placeholder="Allergies, seating preference…"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={save} disabled={pending || !form.name.trim() || !form.phone.trim()}>
              {pending && <Loader2 className="size-4 animate-spin" />}
              {editing ? "Save changes" : "Add customer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
