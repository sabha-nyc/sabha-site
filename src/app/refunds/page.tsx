import Link from "next/link";
import { Logo } from "@/components/Logo";

export const metadata = { title: "Sabha — Refunds" };

export default function RefundsPage() {
  return (
    <main className="scr">
      <Logo width={96} />
      <div className="prose">
        <h1>Refunds and transfers</h1>
        <p>
          <strong>Seats are non-refundable.</strong> The room is small and the food is bought
          against the count, so a seat that goes back is a seat that stays empty.
        </p>
        <p>
          <strong>Every seat is transferable, right up to the day of the dinner.</strong> If you
          can&rsquo;t come, send someone in your place. Text the host their name and number, and
          any dietary restrictions &mdash; that is the whole process. The link you were sent
          becomes theirs; nothing else changes and no money moves.
        </p>
        <p>
          <strong>If a dinner is cancelled</strong> every seat is refunded in full, without
          asking.
        </p>
        <p className="fine">
          <Link href="/">Back</Link>
        </p>
      </div>
      <div className="grow" />
    </main>
  );
}
