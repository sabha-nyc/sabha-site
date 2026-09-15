import Link from "next/link";
import { redirect } from "next/navigation";
import { Logo } from "@/components/Logo";
import { hasAccess } from "@/lib/access";
import { dinnerBySlug, seatsRemaining } from "@/lib/dinners";
import { longDate, money, seatsLeft, time } from "@/lib/format";

export const dynamic = "force-dynamic";

/**
 * The dinner, as facts. Neighbourhood only until payment clears.
 * Only reachable with a valid code cookie — a guessed slug returns the same
 * page as a wrong code.
 */
export default async function DinnerPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const dinner = await dinnerBySlug(slug);
      if (!dinner || dinner.status === "draft") redirect("/?e=1");
      if (dinner.requires_code && !(await hasAccess(slug))) redirect("/?e=1");

  const remaining = await seatsRemaining(dinner.id);
  const closed = dinner.status === "closed";
  if (remaining <= 0 && !closed) redirect(`/d/${slug}/full`);

  return (
    <main className="scr">
      <Logo />

      <dl className="rows">
        <div className="rw">
          <span className="k">Date</span>
          <span className="v">{longDate(dinner.starts_at)}</span>
        </div>
        <div className="rw">
          <span className="k">Time</span>
          <span className="v">{time(dinner.starts_at)}</span>
        </div>
        <div className="rw">
          <span className="k">Where</span>
          <span className="v">{dinner.neighborhood ?? "Manhattan"}</span>
        </div>
        <div className="rw">
          <span className="k">Seat</span>
          <span className="v">{money(dinner.price_cents)}</span>
        </div>
      </dl>

      {closed ? (
        <>
          <p className="seats">Signups closed</p>
          <p className="fine">The next dinner will have its own code.</p>
        </>
      ) : (
        <>
          <p className="seats">{seatsLeft(remaining)}</p>
          <Link className="btn" href={`/d/${slug}/signup`}>
            Sign up
          </Link>
          <p className="fine">The address is shared once your seat is paid for.</p>
        </>
      )}

      <div className="grow" />
    </main>
  );
}
