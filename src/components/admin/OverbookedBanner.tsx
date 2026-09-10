import Link from "next/link";
import { db } from "@/lib/supabase";
import { displayPhone } from "@/lib/format";

/**
 * Someone has been charged for a seat they don't have. That can't live in a
 * log file — it sits at the top of every admin page until the row is dealt
 * with (refund and remove, or transfer them into a seat that opened up).
 */
export async function OverbookedBanner() {
  const { data, error } = await db()
    .from("signups")
    .select("id, name, phone, dinner_id, stripe_payment_intent")
    .eq("status", "overbooked");

  if (error) {
    console.error("[admin] overbooked lookup failed", error);
    return null;
  }
  if (!data || data.length === 0) return null;

  return (
    <div className="banner" role="alert">
      <p className="banner-head">
        {data.length === 1 ? "A seat was paid for that doesn't exist" : `${data.length} seats were paid for that don't exist`}
      </p>
      <ul className="banner-list">
        {data.map((s) => (
          <li key={s.id}>
            <strong>{s.name}</strong> <span className="mono">{displayPhone(s.phone)}</span> —
            charged, not on the list.{" "}
            <Link href={`/admin/dinners/${s.dinner_id}/guests`}>Guest list</Link>
            {s.stripe_payment_intent ? (
              <>
                {" · "}
                <span className="mono">{s.stripe_payment_intent}</span>
              </>
            ) : null}
          </li>
        ))}
      </ul>
      <p className="banner-foot">
        Refund from the Stripe dashboard, then remove the row — or transfer them into a seat that
        has opened up.
      </p>
    </div>
  );
}
