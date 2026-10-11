"use client";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatDay } from "@/lib/format";

type Week = { week: string; new_customers: number; returning_customers: number };
const axis = { stroke: "#a1a1b5", fontSize: 11, tickLine: false, axisLine: false } as const;

export function WeeklyCustomersChart({ data }: { data: Week[] }) {
  const total = data.reduce((s, w) => s + w.new_customers + w.returning_customers, 0);
  return (
    <div role="img" aria-label={`Weekly buyers, new versus returning, ${total} buyer-weeks in total`} className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="rgb(255 255 255 / 0.06)" vertical={false} />
          <XAxis dataKey="week" tickFormatter={formatDay} {...axis} />
          <YAxis allowDecimals={false} width={32} {...axis} />
          <Tooltip labelFormatter={(l) => `Week of ${formatDay(String(l))}`} contentStyle={{ background: "#14141e", border: "1px solid rgb(255 255 255 / 0.1)", borderRadius: 10, fontSize: 12 }} cursor={{ fill: "rgb(255 255 255 / 0.05)" }} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="new_customers" name="New" stackId="a" fill="#22d3ee" />
          <Bar dataKey="returning_customers" name="Returning" stackId="a" fill="#7c5cff" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
