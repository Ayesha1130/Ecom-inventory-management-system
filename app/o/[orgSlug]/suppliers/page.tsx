import { hasRole, requireOrgAccess } from "@/lib/authz";
import { Card, EmptyState } from "@/components/app/Panels";
import { Pill } from "@/components/app/Pill";
import { SupplierForm, SupplierToggle } from "@/components/app/purchasing/SupplierForm";

export default async function SuppliersPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const { supabase, org, role } = await requireOrgAccess(orgSlug);
  const canWrite = hasRole(role, "manager");
  const { data } = await supabase.from("suppliers").select("id, name, email, phone, notes, is_active").eq("organization_id", org.id).order("name");
  const suppliers = data ?? [];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="font-display text-4xl">Suppliers</h1>
        <p className="mt-1 text-sm text-muted">{suppliers.length} supplier{suppliers.length === 1 ? "" : "s"}. Create purchase orders from the Purchase orders page.</p>
      </div>
      {suppliers.length === 0 ? (
        <Card title="Directory"><EmptyState title="No suppliers yet" body={canWrite ? "Add the businesses you buy stock from." : "Suppliers will appear here."} /></Card>
      ) : (
        <div className="panel overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <caption className="sr-only">Suppliers</caption>
            <thead className="border-b border-line text-xs text-muted"><tr>
              <th className="px-4 py-3 font-normal">Supplier</th><th className="px-4 py-3 font-normal">Contact</th>
              <th className="px-4 py-3 font-normal">Status</th>{canWrite && <th className="px-4 py-3"><span className="sr-only">Actions</span></th>}</tr></thead>
            <tbody>
              {suppliers.map((s) => (
                <tr key={s.id} className="border-b border-line last:border-0 align-top">
                  <td className="px-4 py-3">{s.name}{s.notes && <p className="mt-0.5 max-w-sm text-xs text-muted">{s.notes}</p>}</td>
                  <td className="px-4 py-3 text-muted">{s.email ?? "—"}{s.phone && <p className="text-xs">{s.phone}</p>}</td>
                  <td className="px-4 py-3"><Pill tone={s.is_active ? "good" : "muted"}>{s.is_active ? "Active" : "Inactive"}</Pill></td>
                  {canWrite && <td className="px-4 py-3 text-right"><SupplierToggle slug={org.slug} id={s.id} active={s.is_active} /></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {canWrite && <SupplierForm slug={org.slug} />}
    </div>
  );
}
