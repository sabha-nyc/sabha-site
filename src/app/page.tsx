import { Logo } from "@/components/Logo";
import { CodeForm } from "@/components/CodeForm";

export const dynamic = "force-dynamic";

/** The mark and one field. Without a code there is no site. */
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ e?: string }>;
}) {
  const { e } = await searchParams;

  return (
    <main className="scr">
      <div className="grow" />
      <Logo />
      <CodeForm initialError={e ? "That code isn't right." : undefined} />
      <p className="fine">Sabha is invite-only. Your code arrived with your invitation.</p>
      <div className="grow" />
    </main>
  );
}
