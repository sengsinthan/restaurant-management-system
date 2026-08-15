"use client";

import { useMemo } from "react";
import { format } from "date-fns";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, XAxis, YAxis } from "recharts";
import { Download } from "lucide-react";

import { StatCard } from "@/components/shared/stat-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { downloadCsv, toCsv, type CsvColumn } from "@/lib/csv";
import type { DateRangePreset } from "@/lib/date";
import { formatCompactMoney, formatMoney, formatQty } from "@/lib/money";
import { INVENTORY_TX_LABEL, ORDER_TYPE_LABEL, PAYMENT_METHOD_LABEL } from "@/lib/status";
import type { InventoryTxType, OrderType, PaymentMethod } from "@/generated/prisma/enums";

type SalesReport = {
  summary: {
    revenue: number;
    netSales: number;
    discounts: number;
    tax: number;
    serviceCharge: number;
    completedOrders: number;
    totalOrders: number;
    cancelledOrders: number;
    averageOrderValue: number;
  };
  series: { bucket: string; revenue: number; orders: number }[];
  byType: { type: OrderType; total: number; count: number }[];
  byHour: { hour: number; revenue: number; orders: number }[];
};

type ProductRow = {
  menuItemId: string;
  name: string;
  sku: string;
  category: string;
  quantity: number;
  revenue: number;
  cost: number;
  margin: number;
  marginPercent: number;
  orders: number;
};

const CHART_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

export function ReportsView({
  sales,
  products,
  payments,
  inventory,
  staff,
  currency,
  preset,
  rangeLabel,
  canExport,
}: {
  sales: SalesReport;
  products: { best: ProductRow[]; worst: ProductRow[]; all: ProductRow[] };
  payments: {
    rows: { method: PaymentMethod; total: number; change: number; count: number; share: number }[];
    grandTotal: number;
    refunded: number;
    refundCount: number;
  };
  inventory: {
    movements: { type: InventoryTxType; quantity: number; count: number }[];
    stock: {
      id: string;
      name: string;
      sku: string;
      category: string;
      unit: string;
      quantity: number;
      minQuantity: number;
      cost: number;
      value: number;
    }[];
    totalValue: number;
    waste: {
      id: string;
      name: string;
      unit: string;
      quantity: number;
      value: number;
      note: string | null;
      createdAt: Date | string;
    }[];
    wasteValue: number;
  };
  staff: { id: string; name: string; role: string; orders: number; sales: number; averageOrder: number }[];
  currency: string;
  preset: DateRangePreset;
  rangeLabel: string;
  canExport: boolean;
}) {
  const seriesData = useMemo(
    () =>
      sales.series.map((point) => ({
        ...point,
        label:
          preset === "today" || preset === "yesterday"
            ? format(new Date(point.bucket), "HH:mm")
            : format(new Date(point.bucket), "d MMM"),
      })),
    [sales.series, preset],
  );

  const exportCsv = <T,>(name: string, rows: T[], columns: CsvColumn<T>[]) =>
    downloadCsv(`${name}_${rangeLabel}`, toCsv(rows, columns));

  const ExportButton = <T,>({
    name,
    rows,
    columns,
  }: {
    name: string;
    rows: T[];
    columns: CsvColumn<T>[];
  }) =>
    canExport ? (
      <Button
        variant="outline"
        size="sm"
        className="gap-1.5 text-xs"
        onClick={() => exportCsv(name, rows, columns)}
      >
        <Download className="size-3.5" />
        Export CSV
      </Button>
    ) : null;

  return (
    <Tabs defaultValue="sales">
      <TabsList className="flex-wrap">
        <TabsTrigger value="sales">Sales</TabsTrigger>
        <TabsTrigger value="products">Products</TabsTrigger>
        <TabsTrigger value="payments">Payments</TabsTrigger>
        <TabsTrigger value="inventory">Inventory</TabsTrigger>
        <TabsTrigger value="staff">Staff</TabsTrigger>
      </TabsList>

      {/* ------------------------------ Sales ------------------------------ */}
      <TabsContent value="sales" className="space-y-4 pt-4">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Gross revenue"
            value={formatMoney(sales.summary.revenue, currency)}
            icon={Download}
            hint={`${sales.summary.completedOrders} settled orders`}
          />
          <StatCard
            label="Net sales"
            value={formatMoney(sales.summary.netSales, currency)}
            icon={Download}
            tone="success"
            hint="after discounts, before tax"
          />
          <StatCard
            label="Average order"
            value={formatMoney(sales.summary.averageOrderValue, currency)}
            icon={Download}
            tone="info"
          />
          <StatCard
            label="Cancelled"
            value={String(sales.summary.cancelledOrders)}
            icon={Download}
            tone={sales.summary.cancelledOrders > 0 ? "warning" : "success"}
            hint={`of ${sales.summary.totalOrders} placed`}
          />
        </div>

        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle>Revenue over time</CardTitle>
                <CardDescription>Settled orders only.</CardDescription>
              </div>
              <ExportButton
                name="sales"
                rows={sales.series}
                columns={[
                  { header: "Period", value: (r) => format(new Date(r.bucket), "yyyy-MM-dd HH:mm") },
                  { header: "Revenue", value: (r) => r.revenue.toFixed(2) },
                  { header: "Orders", value: (r) => r.orders },
                ]}
              />
            </div>
          </CardHeader>
          <CardContent>
            {seriesData.length === 0 ? (
              <EmptyChart />
            ) : (
              <ChartContainer
                config={{ revenue: { label: "Revenue", color: "var(--chart-1)" } } satisfies ChartConfig}
                className="h-64 w-full"
              >
                <AreaChart data={seriesData} margin={{ left: 4, right: 8, top: 4 }}>
                  <defs>
                    <linearGradient id="reportRevenue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--color-revenue)" stopOpacity={0.45} />
                      <stop offset="100%" stopColor="var(--color-revenue)" stopOpacity={0.03} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={24} fontSize={11} />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    width={56}
                    fontSize={11}
                    tickFormatter={(v: number) => formatCompactMoney(v, currency)}
                  />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent formatter={(value) => formatMoney(Number(value), currency)} />
                    }
                  />
                  <Area
                    type="monotone"
                    dataKey="revenue"
                    stroke="var(--color-revenue)"
                    strokeWidth={2}
                    fill="url(#reportRevenue)"
                  />
                </AreaChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>By order type</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {sales.byType.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">No data.</p>
              ) : (
                sales.byType.map((row) => {
                  const share =
                    sales.summary.revenue > 0 ? (row.total / sales.summary.revenue) * 100 : 0;
                  return (
                    <div key={row.type} className="space-y-1.5">
                      <div className="flex justify-between text-sm">
                        <span className="font-medium">{ORDER_TYPE_LABEL[row.type]}</span>
                        <span className="text-muted-foreground tabular">
                          {row.count} · {formatMoney(row.total, currency)}
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-primary" style={{ width: `${share}%` }} />
                      </div>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Busiest hours</CardTitle>
              <CardDescription>Revenue by hour of day.</CardDescription>
            </CardHeader>
            <CardContent>
              {sales.byHour.length === 0 ? (
                <EmptyChart height="h-48" />
              ) : (
                <ChartContainer
                  config={{ revenue: { label: "Revenue", color: "var(--chart-4)" } } satisfies ChartConfig}
                  className="h-48 w-full"
                >
                  <BarChart
                    data={sales.byHour.map((h) => ({ ...h, label: `${String(h.hour).padStart(2, "0")}:00` }))}
                    margin={{ left: 4, right: 8, top: 4 }}
                  >
                    <CartesianGrid vertical={false} strokeDasharray="3 3" />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={10} minTickGap={12} />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      width={48}
                      fontSize={10}
                      tickFormatter={(v: number) => formatCompactMoney(v, currency)}
                    />
                    <ChartTooltip
                      content={
                        <ChartTooltipContent formatter={(v) => formatMoney(Number(v), currency)} />
                      }
                    />
                    <Bar dataKey="revenue" fill="var(--color-revenue)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ChartContainer>
              )}
            </CardContent>
          </Card>
        </div>
      </TabsContent>

      {/* ---------------------------- Products ---------------------------- */}
      <TabsContent value="products" className="space-y-4 pt-4">
        <div className="grid gap-4 xl:grid-cols-2">
          <ProductTable
            title="Best sellers"
            description="Highest quantity sold in this period."
            rows={products.best}
            currency={currency}
            action={
              <ExportButton
                name="best_sellers"
                rows={products.best}
                columns={productColumns}
              />
            }
          />
          <ProductTable
            title="Worst sellers"
            description="Includes items with no sales at all."
            rows={products.worst}
            currency={currency}
            action={
              <ExportButton name="worst_sellers" rows={products.worst} columns={productColumns} />
            }
          />
        </div>

        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle>All products</CardTitle>
                <CardDescription>Revenue, cost and margin per item.</CardDescription>
              </div>
              <ExportButton name="products" rows={products.all} columns={productColumns} />
            </div>
          </CardHeader>
          <CardContent className="px-0">
            <div className="max-h-[32rem] overflow-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-card">
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead className="hidden md:table-cell">Category</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                    <TableHead className="hidden text-right lg:table-cell">Cost</TableHead>
                    <TableHead className="text-right">Margin</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {products.all.map((row) => (
                    <TableRow key={row.menuItemId}>
                      <TableCell className="font-medium">{row.name}</TableCell>
                      <TableCell className="hidden md:table-cell text-muted-foreground">
                        {row.category}
                      </TableCell>
                      <TableCell className="text-right tabular">{row.quantity}</TableCell>
                      <TableCell className="text-right font-medium tabular">
                        {formatMoney(row.revenue, currency)}
                      </TableCell>
                      <TableCell className="hidden text-right lg:table-cell text-muted-foreground tabular">
                        {formatMoney(row.cost, currency)}
                      </TableCell>
                      <TableCell className="text-right tabular">
                        {formatMoney(row.margin, currency)}
                        <span className="ml-1 text-xs text-muted-foreground">
                          {row.marginPercent.toFixed(0)}%
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      {/* ---------------------------- Payments ---------------------------- */}
      <TabsContent value="payments" className="space-y-4 pt-4">
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <CardTitle>Method mix</CardTitle>
                <ExportButton
                  name="payments"
                  rows={payments.rows}
                  columns={[
                    { header: "Method", value: (r) => PAYMENT_METHOD_LABEL[r.method] },
                    { header: "Transactions", value: (r) => r.count },
                    { header: "Total", value: (r) => r.total.toFixed(2) },
                    { header: "Share %", value: (r) => r.share.toFixed(1) },
                  ]}
                />
              </div>
            </CardHeader>
            <CardContent>
              {payments.rows.length === 0 ? (
                <EmptyChart height="h-52" />
              ) : (
                <ChartContainer config={{}} className="mx-auto h-52">
                  <PieChart>
                    <ChartTooltip
                      content={
                        <ChartTooltipContent formatter={(v) => formatMoney(Number(v), currency)} />
                      }
                    />
                    <Pie
                      data={payments.rows.map((r) => ({
                        name: PAYMENT_METHOD_LABEL[r.method],
                        value: r.total,
                      }))}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={45}
                      outerRadius={80}
                paddingAngle={2}
                    >
                      {payments.rows.map((_, index) => (
                        <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                  </PieChart>
                </ChartContainer>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Totals</CardTitle>
              <CardDescription>
                {payments.refundCount > 0
                  ? `${payments.refundCount} refund(s) worth ${formatMoney(payments.refunded, currency)}.`
                  : "No refunds in this period."}
              </CardDescription>
            </CardHeader>
            <CardContent className="px-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Method</TableHead>
                    <TableHead className="text-right">Count</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Share</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payments.rows.map((row) => (
                    <TableRow key={row.method}>
                      <TableCell className="font-medium">
                        {PAYMENT_METHOD_LABEL[row.method]}
                      </TableCell>
                      <TableCell className="text-right tabular">{row.count}</TableCell>
                      <TableCell className="text-right font-medium tabular">
                        {formatMoney(row.total, currency)}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground tabular">
                        {row.share.toFixed(1)}%
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="border-t-2">
                    <TableCell className="font-semibold">Total</TableCell>
                    <TableCell className="text-right font-semibold tabular">
                      {payments.rows.reduce((acc, r) => acc + r.count, 0)}
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular">
                      {formatMoney(payments.grandTotal, currency)}
                    </TableCell>
                    <TableCell />
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </TabsContent>

      {/* --------------------------- Inventory ---------------------------- */}
      <TabsContent value="inventory" className="space-y-4 pt-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <StatCard
            label="Stock value"
            value={formatMoney(inventory.totalValue, currency)}
            icon={Download}
            hint="at current cost"
          />
          <StatCard
            label="Waste"
            value={formatMoney(inventory.wasteValue, currency)}
            icon={Download}
            tone={inventory.wasteValue > 0 ? "warning" : "success"}
            hint={`${inventory.waste.length} write-off(s)`}
          />
          <StatCard
            label="Movements"
            value={String(inventory.movements.reduce((acc, m) => acc + m.count, 0))}
            icon={Download}
            tone="info"
            hint="ledger entries in period"
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Stock movement</CardTitle>
              <CardDescription>Net quantity change by movement type.</CardDescription>
            </CardHeader>
            <CardContent className="px-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Entries</TableHead>
                    <TableHead className="text-right">Net quantity</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {inventory.movements.map((row) => (
                    <TableRow key={row.type}>
                      <TableCell className="font-medium">{INVENTORY_TX_LABEL[row.type]}</TableCell>
                      <TableCell className="text-right tabular">{row.count}</TableCell>
                      <TableCell
                        className={`text-right tabular ${
                          row.quantity > 0 ? "text-success" : "text-destructive"
                        }`}
                      >
                        {row.quantity > 0 ? "+" : ""}
                        {formatQty(row.quantity)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <div>
                  <CardTitle>Waste log</CardTitle>
                  <CardDescription>Written-off stock in this period.</CardDescription>
                </div>
                <ExportButton
                  name="waste"
                  rows={inventory.waste}
                  columns={[
                    { header: "Date", value: (r) => format(new Date(r.createdAt), "yyyy-MM-dd HH:mm") },
                    { header: "Ingredient", value: (r) => r.name },
                    { header: "Quantity", value: (r) => `${r.quantity}${r.unit}` },
                    { header: "Value", value: (r) => r.value.toFixed(2) },
                    { header: "Reason", value: (r) => r.note ?? "" },
                  ]}
                />
              </div>
            </CardHeader>
            <CardContent className="px-0">
              {inventory.waste.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No waste recorded in this period.
                </p>
              ) : (
                <div className="max-h-72 overflow-auto">
                  <Table>
                    <TableHeader className="sticky top-0 bg-card">
                      <TableRow>
                        <TableHead>Ingredient</TableHead>
                        <TableHead className="text-right">Qty</TableHead>
                        <TableHead className="text-right">Value</TableHead>
                        <TableHead className="hidden sm:table-cell">Reason</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {inventory.waste.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell className="font-medium">{row.name}</TableCell>
                          <TableCell className="text-right tabular">
                            {formatQty(row.quantity)}
                            {row.unit}
                          </TableCell>
                          <TableCell className="text-right tabular">
                            {formatMoney(row.value, currency)}
                          </TableCell>
                          <TableCell className="hidden sm:table-cell text-muted-foreground">
                            {row.note ?? "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle>Current stock</CardTitle>
                <CardDescription>Levels and value across every ingredient.</CardDescription>
              </div>
              <ExportButton
                name="stock"
                rows={inventory.stock}
                columns={[
                  { header: "SKU", value: (r) => r.sku },
                  { header: "Ingredient", value: (r) => r.name },
                  { header: "Category", value: (r) => r.category },
                  { header: "Quantity", value: (r) => r.quantity },
                  { header: "Unit", value: (r) => r.unit },
                  { header: "Minimum", value: (r) => r.minQuantity },
                  { header: "Unit cost", value: (r) => r.cost },
                  { header: "Value", value: (r) => r.value.toFixed(2) },
                ]}
              />
            </div>
          </CardHeader>
          <CardContent className="px-0">
            <div className="max-h-[28rem] overflow-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-card">
                  <TableRow>
                    <TableHead>Ingredient</TableHead>
                    <TableHead className="hidden md:table-cell">Category</TableHead>
                    <TableHead className="text-right">Quantity</TableHead>
                    <TableHead className="hidden text-right sm:table-cell">Minimum</TableHead>
                    <TableHead className="text-right">Value</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {inventory.stock.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-medium">{row.name}</TableCell>
                      <TableCell className="hidden md:table-cell text-muted-foreground">
                        {row.category}
                      </TableCell>
                      <TableCell
                        className={`text-right tabular ${
                          row.quantity <= row.minQuantity ? "text-destructive" : ""
                        }`}
                      >
                        {formatQty(row.quantity)}
                        {row.unit}
                      </TableCell>
                      <TableCell className="hidden text-right sm:table-cell text-muted-foreground tabular">
                        {formatQty(row.minQuantity)}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular">
                        {formatMoney(row.value, currency)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      {/* ------------------------------ Staff ----------------------------- */}
      <TabsContent value="staff" className="pt-4">
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle>Staff performance</CardTitle>
                <CardDescription>Orders handled and sales generated in this period.</CardDescription>
              </div>
              <ExportButton
                name="staff"
                rows={staff}
                columns={[
                  { header: "Name", value: (r) => r.name },
                  { header: "Role", value: (r) => r.role },
                  { header: "Orders", value: (r) => r.orders },
                  { header: "Sales", value: (r) => r.sales.toFixed(2) },
                  { header: "Average order", value: (r) => r.averageOrder.toFixed(2) },
                ]}
              />
            </div>
          </CardHeader>
          <CardContent className="px-0">
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
                {staff.map((row) => (
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
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}

const productColumns: CsvColumn<ProductRow>[] = [
  { header: "SKU", value: (r) => r.sku },
  { header: "Item", value: (r) => r.name },
  { header: "Category", value: (r) => r.category },
  { header: "Quantity sold", value: (r) => r.quantity },
  { header: "Revenue", value: (r) => r.revenue.toFixed(2) },
  { header: "Cost", value: (r) => r.cost.toFixed(2) },
  { header: "Margin", value: (r) => r.margin.toFixed(2) },
  { header: "Margin %", value: (r) => r.marginPercent.toFixed(1) },
];

function ProductTable({
  title,
  description,
  rows,
  currency,
  action,
}: {
  title: string;
  description: string;
  rows: ProductRow[];
  currency: string;
  action?: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle>{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
          {action}
        </div>
      </CardHeader>
      <CardContent className="px-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Item</TableHead>
              <TableHead className="text-right">Qty</TableHead>
              <TableHead className="text-right">Revenue</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.slice(0, 10).map((row) => (
              <TableRow key={row.menuItemId}>
                <TableCell>
                  <p className="font-medium">{row.name}</p>
                  <p className="text-xs text-muted-foreground">{row.category}</p>
                </TableCell>
                <TableCell className="text-right tabular">{row.quantity}</TableCell>
                <TableCell className="text-right font-medium tabular">
                  {formatMoney(row.revenue, currency)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function EmptyChart({ height = "h-64" }: { height?: string }) {
  return (
    <div className={`flex ${height} items-center justify-center rounded-lg border border-dashed`}>
      <p className="text-sm text-muted-foreground">No data for this period.</p>
    </div>
  );
}
