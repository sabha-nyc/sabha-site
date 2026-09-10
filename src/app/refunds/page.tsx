import Link from "next/link";
import { Logo } from "@/components/Logo";

export const metadata = { title: "Sabha — Refunds" };

export default function RefundsPage() {
  return (
    <main className="scr">
      <Logo width={96} />
      <div className="prose">
        <h1>Refunds</h1>
        <p>
          <strong>Full refund up to 72 hours before the dinner.</strong> Text the host, or reply to
          the message your code arrived in, and the refund goes back to the card you paid with.
          Stripe usually returns it within five to ten business days.
        </p>
        <p>
          <strong>Inside 72 hours the seat is transferable but not refundable.</strong> The food is
          bought by then. Send someone in your place &mdash; tell the host who is coming and any
          dietary restrictions, and that is the whole process.
        </p>
        <p>
          <strong>If a dinner is cancelled</strong> every seat is refunded in full, without asking.
        </p>
        <p className="fine">
          <Link href="/">Back</Link>
        </p>
      </div>
      <div className="grow" />
    </main>
  );
}
