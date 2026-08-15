"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { format, formatDistanceToNow } from "date-fns";
import { KeyRound, Loader2, Pencil, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { AppSelect } from "@/components/shared/app-select";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatMoney } from "@/lib/money";
import { USER_STATUS_LABEL, USER_STATUS_TONE } from "@/lib/status";
import { deleteStaffAction, saveStaffAction } from "@/server/actions/staff";
import type { UserStatus } from "@/generated/prisma/enums";

type StaffMember = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  status: UserStatus;
  roleId: string;
  roleName: string;
  roleLabel: string;
  hireDate: Date | string | null;
  lastLoginAt: Date | string | null;
};

type Role = {
  id: string;
  name: string;
  label: string;
  description: string | null;
  permissionCount: number;
};

const STATUS_OPTIONS = Object.entries(USER_STATUS_LABEL).map(([value, label]) => ({ value, label }));

const EMPTY = {
  name: "",
  email: "",
  phone: "",
  roleId: "",
  status: "ACTIVE" as UserStatus,
  hireDate: "",
  password: "",
};

export function StaffView({
  staff,
  roles,
  performance,
  currency,
  canManage,
  currentUserId,
}: {
  staff: StaffMember[];
  roles: Role[];
  performance: {
    id: string;
    name: string;
    email: string;
    role: string;
    orders: number;
    sales: number;
    averageOrder: number;
  }[];
  currency: string;
  canManage: boolean;
  currentUserId: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<StaffMember | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [pending, startSave] = useTransition();
  const [, startTransition] = useTransition();

  const startCreate = () => {
    setForm({ ...EMPTY, roleId: roles.find((r) => r.name === "WAITER")?.id ?? roles[0]?.id ?? "" });
    setEditing(null);
    setOpen(true);
  };

  const startEdit = (member: StaffMember) => {
    setForm({
      name: member.name,
      email: member.email,
      phone: member.phone ?? "",
      roleId: member.roleId,
      status: member.status,
      hireDate: member.hireDate ? format(new Date(member.hireDate), "yyyy-MM-dd") : "",
      password: "",
    });
    setEditing(member);
    setOpen(true);
  };

  const save = () =>
    startSave(async () => {
      const result = await saveStaffAction(editing?.id ?? null, form);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(editing ? "Staff member updated" : "Staff member added");
      setOpen(false);
      router.refresh();
    });

  const remove = (member: StaffMember) =>
    startTransition(async () => {
      const result = await deleteStaffAction(member.id);
      if (!result.ok) toast.error(result.error);
      else {
        toast.success(`${member.name} removed`);
        router.refresh();
      }
    });

  return (
    <>
      <Tabs defaultValue="team">
        <TabsList>
          <TabsTrigger value="team">Team</TabsTrigger>
          <TabsTrigger value="roles">Roles & permissions</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
        </TabsList>

        <TabsContent value="team" className="space-y-3 pt-4">
          {canManage && (
            <div className="flex justify-end">
              <Button className="gap-2" onClick={startCreate}>
                <Plus className="size-4" />
                New staff member
              </Button>
            </div>
          )}

          <Card className="py-0">
            <CardContent className="px-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead className="hidden md:table-cell">Contact</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead className="hidden lg:table-cell">Hired</TableHead>
                      <TableHead className="hidden xl:table-cell">Last sign-in</TableHead>
                      <TableHead>Status</TableHead>
                      {canManage && <TableHead className="w-20" />}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {staff.map((member) => (
                      <TableRow key={member.id}>
                        <TableCell>
                          <p className="font-medium">
                            {member.name}
                            {member.id === currentUserId && (
                              <span className="ml-1.5 text-xs text-muted-foreground">(you)</span>
                            )}
                          </p>
                          <p className="text-xs text-muted-foreground md:hidden">{member.email}</p>
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-muted-foreground">
                          <p className="truncate">{member.email}</p>
                          {member.phone && <p className="text-xs">{member.phone}</p>}
                        </TableCell>
                        <TableCell>
                          <span className="inline-flex rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                            {member.roleLabel}
                          </span>
                        </TableCell>
                        <TableCell className="hidden lg:table-cell text-muted-foreground">
                          {member.hireDate ? format(new Date(member.hireDate), "d MMM yyyy") : "—"}
                        </TableCell>
                        <TableCell className="hidden xl:table-cell text-muted-foreground">
                          {member.lastLoginAt
                            ? formatDistanceToNow(new Date(member.lastLoginAt), { addSuffix: true })
                            : "never"}
                        </TableCell>
                        <TableCell>
                          <StatusBadge
                            label={USER_STATUS_LABEL[member.status]}
                            tone={USER_STATUS_TONE[member.status]}
                          />
                        </TableCell>
                        {canManage && (
                          <TableCell>
                            <div className="flex justify-end gap-0.5">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-8"
                                onClick={() => startEdit(member)}
                                aria-label={`Edit ${member.name}`}
                              >
                                <Pencil className="size-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-8 text-muted-foreground hover:text-destructive"
                                disabled={member.id === currentUserId}
                                onClick={() => remove(member)}
                                aria-label={`Remove ${member.name}`}
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
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="roles" className="pt-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {roles.map((role) => (
              <Card key={role.id}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <ShieldCheck className="size-4 text-primary" />
                    {role.label}
                  </CardTitle>
                  <CardDescription>{role.description}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Permissions</span>
                    <span className="font-semibold tabular">{role.permissionCount}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Assigned staff</span>
                    <span className="font-semibold tabular">
                      {staff.filter((s) => s.roleId === role.id).length}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Permissions are enforced on the server for every page and action — hiding a menu item is
            never the only protection.
          </p>
        </TabsContent>

        <TabsContent value="performance" className="pt-4">
          <Card className="py-0">
            <CardContent className="px-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Staff member</TableHead>
                      <TableHead className="hidden sm:table-cell">Role</TableHead>
                      <TableHead className="text-right">Orders handled</TableHead>
                      <TableHead className="text-right">Sales generated</TableHead>
                      <TableHead className="hidden text-right md:table-cell">Average order</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {performance.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="font-medium">{row.name}</TableCell>
                        <TableCell className="hidden sm:table-cell text-muted-foreground">
                          {row.role}
                        </TableCell>
                        <TableCell className="text-right tabular">{row.orders}</TableCell>
                        <TableCell className="text-right font-medium tabular">
                          {formatMoney(row.sales, currency)}
                        </TableCell>
                        <TableCell className="hidden text-right md:table-cell text-muted-foreground tabular">
                          {formatMoney(row.averageOrder, currency)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
          <p className="mt-3 text-xs text-muted-foreground">
            Figures cover settled orders from the start of this month.
          </p>
        </TabsContent>
      </Tabs>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? `Edit ${editing.name}` : "New staff member"}</DialogTitle>
            <DialogDescription>
              The role determines which screens and actions this account can reach.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="s-name">Name</Label>
              <Input
                id="s-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="s-email">Email</Label>
              <Input
                id="s-email"
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="s-phone">Phone</Label>
                <Input
                  id="s-phone"
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="s-hire">Hire date</Label>
                <Input
                  id="s-hire"
                  type="date"
                  value={form.hireDate}
                  onChange={(e) => setForm((f) => ({ ...f, hireDate: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Role</Label>
                <AppSelect
                  value={form.roleId}
                  onValueChange={(v) => setForm((f) => ({ ...f, roleId: v }))}
                  options={roles.map((r) => ({ value: r.id, label: r.label }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <AppSelect
                  value={form.status}
                  onValueChange={(v) => setForm((f) => ({ ...f, status: v as UserStatus }))}
                  options={STATUS_OPTIONS}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="s-password" className="flex items-center gap-1.5">
                <KeyRound className="size-3.5" />
                {editing ? "New password (leave blank to keep)" : "Starting password"}
              </Label>
              <Input
                id="s-password"
                type="password"
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                placeholder="At least 8 characters"
                autoComplete="new-password"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button
              onClick={save}
              disabled={pending || !form.name.trim() || !form.email.trim() || !form.roleId}
            >
              {pending && <Loader2 className="size-4 animate-spin" />}
              {editing ? "Save changes" : "Create account"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
