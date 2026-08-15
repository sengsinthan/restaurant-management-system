"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { Check, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { changePasswordAction, updateProfileAction } from "@/server/actions/staff";

export function ProfileForm({
  account,
  permissionGroups,
}: {
  account: {
    name: string;
    email: string;
    phone: string | null;
    roleLabel: string;
    hireDate: Date | string | null;
    lastLoginAt: Date | string | null;
  };
  permissionGroups: { group: string; labels: string[] }[];
}) {
  const router = useRouter();
  const [profile, setProfile] = useState({ name: account.name, phone: account.phone ?? "" });
  const [passwords, setPasswords] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [savingProfile, startProfile] = useTransition();
  const [savingPassword, startPassword] = useTransition();

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        <Card>
          <CardHeader>
            <CardTitle>Your details</CardTitle>
            <CardDescription>
              Your email and role are managed by an administrator.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="p-name">Name</Label>
              <Input
                id="p-name"
                value={profile.name}
                onChange={(e) => setProfile((p) => ({ ...p, name: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p-phone">Phone</Label>
              <Input
                id="p-phone"
                value={profile.phone}
                onChange={(e) => setProfile((p) => ({ ...p, phone: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p-email">Email</Label>
              <Input id="p-email" value={account.email} disabled />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p-role">Role</Label>
              <Input id="p-role" value={account.roleLabel} disabled />
            </div>
            <div className="sm:col-span-2">
              <Button
                disabled={savingProfile || profile.name.trim().length < 2}
                onClick={() =>
                  startProfile(async () => {
                    const result = await updateProfileAction(profile);
                    if (!result.ok) {
                      toast.error(result.error);
                      return;
                    }
                    toast.success("Profile updated");
                    router.refresh();
                  })
                }
              >
                {savingProfile && <Loader2 className="size-4 animate-spin" />}
                Save profile
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Change password</CardTitle>
            <CardDescription>At least 8 characters.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="p-current">Current password</Label>
              <Input
                id="p-current"
                type="password"
                autoComplete="current-password"
                value={passwords.currentPassword}
                onChange={(e) =>
                  setPasswords((p) => ({ ...p, currentPassword: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p-new">New password</Label>
              <Input
                id="p-new"
                type="password"
                autoComplete="new-password"
                value={passwords.newPassword}
                onChange={(e) => setPasswords((p) => ({ ...p, newPassword: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p-confirm">Confirm new password</Label>
              <Input
                id="p-confirm"
                type="password"
                autoComplete="new-password"
                value={passwords.confirmPassword}
                onChange={(e) =>
                  setPasswords((p) => ({ ...p, confirmPassword: e.target.value }))
                }
              />
            </div>
            <div className="sm:col-span-2">
              <Button
                disabled={
                  savingPassword ||
                  !passwords.currentPassword ||
                  passwords.newPassword.length < 8 ||
                  passwords.newPassword !== passwords.confirmPassword
                }
                onClick={() =>
                  startPassword(async () => {
                    const result = await changePasswordAction(passwords);
                    if (!result.ok) {
                      toast.error(result.error);
                      return;
                    }
                    toast.success("Password changed");
                    setPasswords({ currentPassword: "", newPassword: "", confirmPassword: "" });
                  })
                }
              >
                {savingPassword && <Loader2 className="size-4 animate-spin" />}
                Change password
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Your access</CardTitle>
          <CardDescription>
            What the {account.roleLabel} role permits. Enforced on the server for every request.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {permissionGroups.map((group) => (
            <div key={group.group}>
              <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                {group.group}
              </p>
              <ul className="mt-1 space-y-0.5">
                {group.labels.map((label) => (
                  <li key={label} className="flex items-center gap-1.5 text-sm">
                    <Check className="size-3.5 shrink-0 text-success" />
                    {label}
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <div className="border-t pt-3 text-xs text-muted-foreground">
            {account.hireDate && <p>Hired {format(new Date(account.hireDate), "d MMMM yyyy")}</p>}
            {account.lastLoginAt && (
              <p>Last sign-in {format(new Date(account.lastLoginAt), "d MMM yyyy, HH:mm")}</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
