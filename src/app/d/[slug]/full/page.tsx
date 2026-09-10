import { redirect } from "next/navigation";
import { Logo } from "@/components/Logo";
import { hasAccess } from "@/lib/access";
import { dinnerBySlug } from "@/lib/dinners";
import { longDate } from "@/lib/format";

export const dynamic = "force-dynamic";

/** Sold out. No waitlist by design. */
export default async function FullPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!(await hasAccess(slug))) redirect("/?e=1");

  const dinner = await dinnerBySlug(slug);
  if (!dinner) redirect("/?e=1");

  return (
    <main className="scr">
      <div className="grow" />
      <Logo />
      <p className="status" style={{ color: "var(--accent-warn)" }}>
        Full
      </p>
      <p className="note">{longDate(dinner.starts_at)} is fully booked.</p>
      <p className="fine">The next dinner will have its own code. It usually goes out within a fortnight.</p>
      <div className="grow" />
    </main>
  );
}
