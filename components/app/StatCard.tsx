export function StatCard({
  label,
  value,
  delta,
  hint,
  tone,
}: {
  label: string;
  value: string;
  delta?: number | null;
  hint?: string;
  tone?: "warn";
}) {
  return (
    <div className="panel p-5">
      <p className="text-sm text-muted">{label}</p>
      <p className={`mt-2 font-mono text-3xl ${tone === "warn" ? "text-warn" : ""}`}>{value}</p>
      <p className="mt-2 h-4 text-xs text-muted">
        {typeof delta === "number" ? (
          <span className={delta >= 0 ? "text-cyan" : "text-red-300"}>
            {delta >= 0 ? "+" : ""}
            {delta.toFixed(1)}%
          </span>
        ) : null}{" "}
        {hint}
      </p>
    </div>
  );
}
