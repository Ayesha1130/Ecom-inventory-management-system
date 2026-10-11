import { Card } from "@/components/app/Panels";

// Mirrors the database policies and functions; if you change those, change this table.
const rows: [string, boolean, boolean, boolean, boolean][] = [
  ["View orders, customers, products, inventory, analytics", true, true, true, true],
  ["Fulfill orders (mark shipped or delivered)", true, true, true, true],
  ["Add customer notes", true, true, true, true],
  ["Create and edit products, adjust and transfer stock", false, true, true, true],
  ["Manage suppliers, create and receive purchase orders", false, true, true, true],
  ["Cancel unpaid orders and issue refunds", false, true, true, true],
  ["Edit and publish the storefront", false, false, true, true],
  ["Invite and remove team members, change roles up to your own", false, false, true, true],
  ["Read the audit log", false, false, true, true],
  ["Manage owners (the last owner can never be removed)", false, false, false, true],
];

export default function RolesPage() {
  return (
    <Card title="What each role can do">
      <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-left text-sm">
        <caption className="sr-only">Permissions by role</caption>
        <thead className="text-xs text-muted"><tr><th className="pb-2 font-normal">Capability</th>
          {["Staff", "Manager", "Admin", "Owner"].map((r) => <th key={r} className="pb-2 text-center font-normal">{r}</th>)}</tr></thead>
        <tbody>
          {rows.map(([label, ...cells]) => (
            <tr key={label} className="border-t border-line">
              <td className="py-2.5 pr-4">{label}</td>
              {cells.map((ok, i) => <td key={i} className="py-2.5 text-center"><span aria-label={ok ? "Allowed" : "Not allowed"} className={ok ? "text-cyan" : "text-muted/50"}>{ok ? "✓" : "—"}</span></td>)}
            </tr>
          ))}
        </tbody>
      </table></div>
      <p className="mt-4 text-xs text-muted">These rules are enforced in the database, not just in the interface. Nobody can grant a role higher than their own or change their own role.</p>
    </Card>
  );
}
