import { SettingsNav } from "@/components/app/SettingsNav";

export default async function SettingsLayout({ children, params }: { children: React.ReactNode; params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <h1 className="font-display text-4xl">Settings</h1>
      <SettingsNav slug={orgSlug} />
      {children}
    </div>
  );
}
