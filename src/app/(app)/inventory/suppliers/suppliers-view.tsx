"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Mail, MapPin, Pencil, Phone, Plus, Trash2, Truck } from "lucide-react";
import { toast } from "sonner";

import { EmptyState } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { formatMoney } from "@/lib/money";
import { deleteSupplierAction, saveSupplierAction } from "@/server/actions/inventory";

type Supplier = {
  id: string;
  name: string;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  isActive: boolean;
  ingredientCount: number;
  stockValue: number;
};

const EMPTY = {
  name: "",
  contactName: "",
  phone: "",
  email: "",
  address: "",
  notes: "",
  isActive: true,
};

export function SuppliersView({
  suppliers,
  currency,
  canManage,
}: {
  suppliers: Supplier[];
  currency: string;
  canManage: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [pending, startSave] = useTransition();
  const [, startTransition] = useTransition();

  const startCreate = () => {
    setForm(EMPTY);
    setEditing(null);
    setOpen(true);
  };

  const startEdit = (supplier: Supplier) => {
    setForm({
      name: supplier.name,
      contactName: supplier.contactName ?? "",
      phone: supplier.phone ?? "",
      email: supplier.email ?? "",
      address: supplier.address ?? "",
      notes: supplier.notes ?? "",
      isActive: supplier.isActive,
    });
    setEditing(supplier);
    setOpen(true);
  };

  const save = () =>
    startSave(async () => {
      const result = await saveSupplierAction(editing?.id ?? null, form);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(editing ? "Supplier updated" : "Supplier added");
      setOpen(false);
      router.refresh();
    });

  const remove = (supplier: Supplier) =>
    startTransition(async () => {
      const result = await deleteSupplierAction(supplier.id);
      if (!result.ok) toast.error(result.error);
      else {
        toast.success(`${supplier.name} removed`);
        router.refresh();
      }
    });

  return (
    <>
      {canManage && (
        <div className="flex justify-end">
          <Button className="gap-2" onClick={startCreate}>
            <Plus className="size-4" />
            New supplier
          </Button>
        </div>
      )}

      {suppliers.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState
              icon={Truck}
              title="No suppliers yet"
              description="Add the businesses you order ingredients from."
              action={canManage ? <Button onClick={startCreate}>Add a supplier</Button> : undefined}
            />
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {suppliers.map((supplier) => (
            <Card key={supplier.id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <CardTitle className="truncate">{supplier.name}</CardTitle>
                    {supplier.contactName && (
                      <p className="mt-0.5 truncate text-sm text-muted-foreground">
                        {supplier.contactName}
                      </p>
                    )}
                  </div>
                  <StatusBadge
                    label={supplier.isActive ? "Active" : "Inactive"}
                    tone={
                      supplier.isActive
                        ? "bg-success/15 text-success border-success/30"
                        : "bg-muted text-muted-foreground border-border"
                    }
                  />
                </div>
              </CardHeader>
              <CardContent className="space-y-2.5">
                <div className="space-y-1.5 text-sm">
                  {supplier.phone && (
                    <p className="flex items-center gap-2 text-muted-foreground">
                      <Phone className="size-3.5 shrink-0" />
                      {supplier.phone}
                    </p>
                  )}
                  {supplier.email && (
                    <p className="flex items-center gap-2 truncate text-muted-foreground">
                      <Mail className="size-3.5 shrink-0" />
                      {supplier.email}
                    </p>
                  )}
                  {supplier.address && (
                    <p className="flex items-start gap-2 text-muted-foreground">
                      <MapPin className="mt-0.5 size-3.5 shrink-0" />
                      {supplier.address}
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2 border-t pt-2.5 text-center">
                  <div>
                    <p className="text-xs text-muted-foreground">Ingredients</p>
                    <p className="font-semibold tabular">{supplier.ingredientCount}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Stock value</p>
                    <p className="font-semibold tabular">
                      {formatMoney(supplier.stockValue, currency)}
                    </p>
                  </div>
                </div>

                {canManage && (
                  <div className="flex gap-1.5 border-t pt-2.5">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 gap-1.5"
                      onClick={() => startEdit(supplier)}
                    >
                      <Pencil className="size-3.5" />
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      className="size-8 text-muted-foreground hover:text-destructive"
                      onClick={() => remove(supplier)}
                      aria-label={`Delete ${supplier.name}`}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? `Edit ${editing.name}` : "New supplier"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="sup-name">Business name</Label>
              <Input
                id="sup-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Harbour Fresh Seafood"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sup-contact">Contact person</Label>
              <Input
                id="sup-contact"
                value={form.contactName}
                onChange={(e) => setForm((f) => ({ ...f, contactName: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="sup-phone">Phone</Label>
                <Input
                  id="sup-phone"
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sup-email">Email</Label>
                <Input
                  id="sup-email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sup-address">Address</Label>
              <Input
                id="sup-address"
                value={form.address}
                onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sup-notes">Notes</Label>
              <Textarea
                id="sup-notes"
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                rows={2}
                placeholder="Delivery days, payment terms…"
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="sup-active"
                checked={form.isActive}
                onCheckedChange={(checked) => setForm((f) => ({ ...f, isActive: checked }))}
              />
              <Label htmlFor="sup-active">Active</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={save} disabled={pending || form.name.trim().length < 2}>
              {pending && <Loader2 className="size-4 animate-spin" />}
              {editing ? "Save changes" : "Add supplier"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
