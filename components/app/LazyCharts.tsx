"use client";
import dynamic from "next/dynamic";

/** The charting library is ~100 kB; loading it lazily keeps it out of the initial page weight. */
const placeholder = () => <div className="h-64 animate-pulse rounded-lg bg-white/5" aria-hidden />;

export const RevenueChart = dynamic(() => import("./Charts").then((m) => m.RevenueChart), { ssr: false, loading: placeholder });
export const OrdersChart = dynamic(() => import("./Charts").then((m) => m.OrdersChart), { ssr: false, loading: placeholder });
export const WeeklyCustomersChart = dynamic(() => import("./AnalyticsCharts").then((m) => m.WeeklyCustomersChart), { ssr: false, loading: placeholder });
