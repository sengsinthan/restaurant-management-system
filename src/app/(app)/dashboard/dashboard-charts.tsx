"use client";

import { useMemo } from "react";
import { format } from "date-fns";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { formatCompactMoney, formatMoney } from "@/lib/money";
import type { DateRangePreset } from "@/lib/date";
import type { SeriesPoint } from "@/server/services/analytics";

const revenueConfig = {
  revenue: { label: "Revenue", color: "var(--chart-1)" },
} satisfies ChartConfig;

const ordersConfig = {
  orders: { label: "Orders", color: "var(--chart-2)" },
} satisfies ChartConfig;

export function DashboardCharts({
  series,
  currency,
  preset,
}: {
  series: SeriesPoint[];
  currency: string;
  preset: DateRangePreset;
}) {
  const data = useMemo(
    () =>
      series.map((point) => ({
        ...point,
        label:
          preset === "today" || preset === "yesterday"
            ? format(new Date(point.bucket), "HH:mm")
            : format(new Date(point.bucket), "d MMM"),
      })),
    [series, preset],
  );

  const empty = data.length === 0;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Sales</CardTitle>
          <CardDescription>Settled revenue across the selected period.</CardDescription>
        </CardHeader>
        <CardContent>
          {empty ? (
            <EmptyChart />
          ) : (
            <ChartContainer config={revenueConfig} className="h-56 w-full">
              <AreaChart data={data} margin={{ left: 4, right: 8, top: 4 }}>
                <defs>
                  <linearGradient id="fillRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-revenue)" stopOpacity={0.45} />
                    <stop offset="100%" stopColor="var(--color-revenue)" stopOpacity={0.03} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  minTickGap={24}
                  fontSize={11}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  width={52}
                  fontSize={11}
                  tickFormatter={(value: number) => formatCompactMoney(value, currency)}
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      formatter={(value) => formatMoney(Number(value), currency)}
                    />
                  }
                />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke="var(--color-revenue)"
                  strokeWidth={2}
                  fill="url(#fillRevenue)"
                />
              </AreaChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Orders</CardTitle>
          <CardDescription>Completed ticket count per interval.</CardDescription>
        </CardHeader>
        <CardContent>
          {empty ? (
            <EmptyChart />
          ) : (
            <ChartContainer config={ordersConfig} className="h-56 w-full">
              <BarChart data={data} margin={{ left: 4, right: 8, top: 4 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  minTickGap={24}
                  fontSize={11}
                />
                <YAxis tickLine={false} axisLine={false} width={32} fontSize={11} allowDecimals={false} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="orders" fill="var(--color-orders)" radius={[4, 4, 0, 0]} maxBarSize={38} />
              </BarChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function EmptyChart() {
  return (
    <div className="flex h-56 items-center justify-center rounded-lg border border-dashed">
      <p className="text-sm text-muted-foreground">No sales recorded in this period.</p>
    </div>
  );
}
