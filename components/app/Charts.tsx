"use client";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatDay, formatMoney } from "@/lib/format";

type Point = { day: string; revenue_cents: number; orders: number };
const axis = { stroke: "#a1a1b5", fontSize: 11, tickLine: false, axisLine: false } as const;

function Tip({ active, payload, label, money, currency }: {
  active?: boolean; payload?: { value: number }[]; label?: string; money?: boolean; currency: string;
}) {
  if (!active || !payload?.length || !label) return null;
  const v = payload[0]!.value;
  return (
    <div className="glass px-3 py-2 text-xs">
      <p className="text-muted">{formatDay(label)}</p>
      <p className="font-mono">{money ? formatMoney(v, currency) : `${v} orders`}</p>
    </div>
  );
}

export function RevenueChart({ data, currency }: { data: Point[]; currency: string }) {
  const total = data.reduce((s, d) => s + d.revenue_cents, 0);
  return (
    <div role="img" aria-label={`Daily revenue, ${formatMoney(total, currency)} in total`} className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#7c5cff" stopOpacity={0.5} />
              <stop offset="100%" stopColor="#7c5cff" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="rgb(255 255 255 / 0.06)" vertical={false} />
          <XAxis dataKey="day" tickFormatter={formatDay} minTickGap={32} {...axis} />
          <YAxis tickFormatter={(v: number) => formatMoney(v, currency, true)} width={56} {...axis} />
          <Tooltip content={<Tip money currency={currency} />} cursor={{ stroke: "rgb(255 255 255 / 0.15)" }} />
          <Area type="monotone" dataKey="revenue_cents" stroke="#7c5cff" strokeWidth={2} fill="url(#rev)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function OrdersChart({ data }: { data: Point[] }) {
  const total = data.reduce((s, d) => s + d.orders, 0);
  return (
    <div role="img" aria-label={`Daily orders, ${total} in total`} className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="rgb(255 255 255 / 0.06)" vertical={false} />
          <XAxis dataKey="day" tickFormatter={formatDay} minTickGap={32} {...axis} />
          <YAxis allowDecimals={false} width={32} {...axis} />
          <Tooltip content={<Tip currency="USD" />} cursor={{ fill: "rgb(255 255 255 / 0.05)" }} />
          <Bar dataKey="orders" fill="#22d3ee" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
