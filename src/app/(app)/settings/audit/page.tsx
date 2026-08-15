import type { Metadata } from "next";
import { format } from "date-fns";
import { ScrollText } from "lucide-react";

import { EmptyState } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { prisma } from "@/lib/prisma";
import { PERMISSIONS } from "@/lib/permissions";
import { requirePermission } from "@/server/auth/rbac";

export const metadata: Metadata = { title: "Audit log" };
export const dynamic = "force-dynamic";

const ACTION_TONE: Record<string, string> = {
  CREATE: "bg-success/15 text-success border-success/30",
  UPDATE: "bg-info/12 text-info border-info/30",
  DELETE: "bg-destructive/10 text-destructive border-destructive/25",
  CANCEL: "bg-destructive/10 text-destructive border-destructive/25",
  PAYMENT: "bg-primary/10 text-primary border-primary/25",
  REFUND: "bg-warning/15 text-warning-foreground dark:text-warning border-warning/30",
  STATUS_CHANGE: "bg-muted text-muted-foreground border-border",
  LOGIN: "bg-muted text-muted-foreground border-border",
  LOGOUT: "bg-muted text-muted-foreground border-border",
};

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, val]) => `${key}: ${JSON.stringify(val)}`)
      .join(", ");
  }
  return String(value);
}

export default async function AuditPage({ searchParams }: PageProps<"/settings/audit">) {
  await requirePermission(PERMISSIONS.AUDIT_VIEW);
  const params = await searchParams;
  const page = Math.max(1, Number(typeof params.page === "string" ? params.page : "1") || 1);
  const pageSize = 50;

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.auditLog.count(),
  ]);

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {total.toLocaleString()} recorded action{total === 1 ? "" : "s"}. Price changes, cancellations,
        stock adjustments, payments and refunds are all captured here.
      </p>

      <Card className="py-0">
        <CardContent className="px-0">
          {logs.length === 0 ? (
            <EmptyState icon={ScrollText} title="Nothing recorded yet" />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Entity</TableHead>
                    <TableHead className="hidden lg:table-cell">Description</TableHead>
                    <TableHead className="hidden xl:table-cell">Previous → New</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {format(new Date(log.createdAt), "d MMM, HH:mm:ss")}
                      </TableCell>
                      <TableCell className="font-medium">{log.userName}</TableCell>
                      <TableCell>
                        <StatusBadge
                          label={log.action.replace(/_/g, " ")}
                          tone={ACTION_TONE[log.action] ?? "bg-muted text-muted-foreground border-border"}
                        />
                      </TableCell>
                      <TableCell className="text-muted-foreground">{log.entity}</TableCell>
                      <TableCell className="hidden max-w-md truncate lg:table-cell">
                        {log.description ?? "—"}
                      </TableCell>
                      <TableCell className="hidden max-w-md truncate xl:table-cell font-mono text-xs text-muted-foreground">
                        {log.previousValue || log.newValue
                          ? `${formatValue(log.previousValue)} → ${formatValue(log.newValue)}`
                          : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {total > pageSize && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Page {page} of {Math.ceil(total / pageSize)}
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <a
                href={`/settings/audit?page=${page - 1}`}
                className="rounded-lg border px-3 py-1.5 transition-colors hover:bg-muted"
              >
                Previous
              </a>
            )}
            {page < Math.ceil(total / pageSize) && (
              <a
                href={`/settings/audit?page=${page + 1}`}
                className="rounded-lg border px-3 py-1.5 transition-colors hover:bg-muted"
              >
                Next
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
