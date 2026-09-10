import Link from "next/link";
import { redirect } from "next/navigation";
import { Logo } from "@/components/Logo";
import { SignupForm } from "@/components/SignupForm";
import { hasAccess } from "@/lib/access";
import { env } from "@/lib/env";
import { dinnerBySlug, seatsRemaining } from "@/lib/dinners";
import { money } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function SignupPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!(await hasAccess(slug))) redirect("/?e=1");

  const dinner = await dinnerBySlug(slug);
  if (!dinner || dinner.status !== "open") redirect(`/d/${slug}`);

  const remaining = await seatsRemaining(dinner.id);
  if (remaining <= 0) redirect(`/d/${slug}/full`);

  return (
    <main className="scr">
      <Logo />

      <SignupForm slug={slug} priceLabel={money(dinner.price_cents)} />

      <p className="fine">
        Card handled by Stripe; the site never sees it. Your seat is held for{" "}
        {env.seatHoldMinutes} minutes. Full refund up to 72 hours before &mdash;{" "}
        <Link href="/refunds">the policy in full</Link>.
      </p>

      <div className="grow" />
    </main>
  );
}
