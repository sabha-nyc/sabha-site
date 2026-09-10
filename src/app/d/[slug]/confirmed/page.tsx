import { redirect } from "next/navigation";
import { Logo } from "@/components/Logo";
import { AwaitPayment } from "@/components/AwaitPayment";
import { dinnerBySlug, signupByToken } from "@/lib/dinners";
import { longDate, moneyExact, time } from "@/lib/format";

export const dynamic = "force-dynamic";

/**
 * The reveal: the address, and the two things anyone actually does next.
 * Bookmarkable via the token — no login, a link in a text is enough.
 */
export default async function ConfirmedPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  const { slug } = await params;
  const { t } = await searchParams;
  if (!t) redirect("/?e=1");

  const signup = await signupByToken(t);
  const dinner = await dinnerBySlug(slug);
  if (!signup || !dinner || signup.dinner_id !== dinner.id) redirect("/?e=1");

  // The webhook is the source of truth, and it can land a beat after the
  // redirect. Say so plainly rather than showing a wrong answer.
  if (signup.status === "pending") {
    return (
      <main className="scr">
        <Logo />
        <p className="status">Payment received</p>
        <p className="note">Confirming with the card processor. This page will update itself.</p>
        <AwaitPayment />
        <p className="fine">
          Nothing more to do &mdash; you can close this. The address arrives here and by text.
        </p>
        <div className="grow" />
      </main>
    );
  }

  if (!["paid", "comped"].includes(signup.status)) {
    return (
      <main className="scr">
        <Logo />
        <p className="status" style={{ color: "var(--accent-warn)" }}>
          Seat not held
        </p>
        <p className="note">
          {signup.status === "refunded"
            ? "This seat was refunded."
            : signup.status === "overbooked"
              ? "The card was charged but the seat had gone. The host has been alerted and will refund you."
              : "This seat was released."}
        </p>
        <p className="fine">If that looks wrong, text the host.</p>
        <div className="grow" />
      </main>
    );
  }

  const calendarHref = `/d/${slug}/calendar.ics?t=${signup.details_token}`;
  const smsHref = dinner.host_phone ? `sms:${dinner.host_phone}` : null;

  return (
    <main className="scr">
      <Logo />

      <p className="status">Confirmed</p>
      <p className="addr">
        {(dinner.full_address ?? "").split("\n").map((line, i) => (
          <span key={i}>
            {line}
            <br />
          </span>
        ))}
      </p>

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
          <span className="k">Name</span>
          <span className="v">{signup.name}</span>
        </div>
        {signup.status === "paid" && signup.amount_paid_cents != null ? (
          <div className="rw">
            <span className="k">Paid</span>
            <span className="v">{moneyExact(signup.amount_paid_cents)}</span>
          </div>
        ) : null}
      </dl>

      <a className="ghost" href={calendarHref} download>
        Add to calendar
      </a>
      {smsHref ? (
        <a className="ghost" href={smsHref}>
          Text the host
        </a>
      ) : null}

      {dinner.details_note ? <p className="fine">{dinner.details_note}</p> : null}

      <div className="grow" />
    </main>
  );
}
