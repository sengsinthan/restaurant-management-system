"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ListTree, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { EmptyState } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
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
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { deleteCategoryAction, saveCategoryAction } from "@/server/actions/menu";

type Category = {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  sortOrder: number;
  isActive: boolean;
  itemCount: number;
};

const PALETTE = ["#f59e0b", "#ef4444", "#10b981", "#8b5cf6", "#0ea5e9", "#ec4899", "#f97316"];

export function CategoriesTable({
  categories,
  canManage,
}: {
  categories: Category[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<Category | null>(null);
  const [creating, setCreating] = useState(false);
  const [pending, startTransition] = useTransition();

  const open = creating || !!editing;
  const [form, setForm] = useState({
    name: "",
    description: "",
    color: PALETTE[0],
    sortOrder: 0,
    isActive: true,
  });

  const startCreate = () => {
    setForm({ name: "", description: "", color: PALETTE[0], sortOrder: categories.length, isActive: true });
    setEditing(null);
    setCreating(true);
  };

  const startEdit = (category: Category) => {
    setForm({
      name: category.name,
      description: category.description ?? "",
      color: category.color ?? PALETTE[0],
      sortOrder: category.sortOrder,
      isActive: category.isActive,
    });
    setCreating(false);
    setEditing(category);
  };

  const close = () => {
    setCreating(false);
    setEditing(null);
  };

  const save = () =>
    startTransition(async () => {
      const result = await saveCategoryAction(editing?.id ?? null, form);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(editing ? "Category updated" : "Category created");
      close();
      router.refresh();
    });

  const remove = (category: Category) =>
    startTransition(async () => {
      const result = await deleteCategoryAction(category.id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`${category.name} deleted`);
      router.refresh();
    });

  return (
    <>
      {canManage && (
        <div className="flex justify-end">
          <Button className="gap-2" onClick={startCreate}>
            <Plus className="size-4" />
            New category
          </Button>
        </div>
      )}

      <Card className="py-0">
        <CardContent className="px-0">
          {categories.length === 0 ? (
            <EmptyState
              icon={ListTree}
              title="No categories yet"
              description="Categories organise the POS menu grid."
              action={canManage ? <Button onClick={startCreate}>Create the first one</Button> : undefined}
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">#</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="hidden md:table-cell">Description</TableHead>
                    <TableHead className="text-right">Items</TableHead>
                    <TableHead>Status</TableHead>
                    {canManage && <TableHead className="w-24" />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {categories.map((category) => (
                    <TableRow key={category.id}>
                      <TableCell className="text-muted-foreground tabular">
                        {category.sortOrder}
                      </TableCell>
                      <TableCell>
                        <span className="flex items-center gap-2 font-medium">
                          <span
                            className="size-2.5 shrink-0 rounded-full"
                            style={{ backgroundColor: category.color ?? "var(--muted-foreground)" }}
                          />
                          {category.name}
                        </span>
                      </TableCell>
                      <TableCell className="hidden max-w-sm truncate md:table-cell text-muted-foreground">
                        {category.description ?? "—"}
                      </TableCell>
                      <TableCell className="text-right tabular">{category.itemCount}</TableCell>
                      <TableCell>
                        <StatusBadge
                          label={category.isActive ? "Active" : "Hidden"}
                          tone={
                            category.isActive
                              ? "bg-success/15 text-success border-success/30"
                              : "bg-muted text-muted-foreground border-border"
                          }
                        />
                      </TableCell>
                      {canManage && (
                        <TableCell>
                          <div className="flex justify-end gap-0.5">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-8"
                              onClick={() => startEdit(category)}
                              aria-label={`Edit ${category.name}`}
                            >
                              <Pencil className="size-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-8 text-muted-foreground hover:text-destructive"
                              disabled={pending}
                              onClick={() => remove(category)}
                              aria-label={`Delete ${category.name}`}
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

      <Dialog open={open} onOpenChange={(next) => !next && close()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? `Edit ${editing.name}` : "New category"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="cat-name">Name</Label>
              <Input
                id="cat-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Appetizers"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cat-desc">Description</Label>
              <Textarea
                id="cat-desc"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                rows={2}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Colour</Label>
              <div className="flex gap-1.5">
                {PALETTE.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, color }))}
                    className={`size-7 rounded-full border-2 transition-transform ${
                      form.color === color ? "scale-110 border-foreground" : "border-transparent"
                    }`}
                    style={{ backgroundColor: color }}
                    aria-label={`Colour ${color}`}
                  />
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="cat-order">Sort order</Label>
                <Input
                  id="cat-order"
                  inputMode="numeric"
                  value={form.sortOrder}
                  onChange={(e) => setForm((f) => ({ ...f, sortOrder: Number(e.target.value) || 0 }))}
                  className="tabular"
                />
              </div>
              <div className="flex items-end gap-2 pb-1.5">
                <Switch
                  id="cat-active"
                  checked={form.isActive}
                  onCheckedChange={(checked) => setForm((f) => ({ ...f, isActive: checked }))}
                />
                <Label htmlFor="cat-active">Active</Label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={close} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={save} disabled={pending || form.name.trim().length < 2}>
              {pending && <Loader2 className="size-4 animate-spin" />}
              {editing ? "Save changes" : "Create category"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
