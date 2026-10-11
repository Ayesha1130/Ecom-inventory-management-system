import { redirect } from "next/navigation";

export default async function SettingsIndex({ params }: { params: Promise<{ orgSlug: string }> }) {
  redirect(`/o/${(await params).orgSlug}/settings/team`);
}
