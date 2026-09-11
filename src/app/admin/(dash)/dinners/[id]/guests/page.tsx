import Link from "next/link";
import { notFound } from "next/navigation";
import { AddGuestForm } from "@/components/admin/AddGuestForm";
import { CopyButton } from "@/components/admin/CopyButton";
import { RemoveGuest } from "@/components/admin/RemoveGuest";
import { TransferGuest } from "@/components/admin/TransferGuest";
import { OpenSignups } from "@/components/admin/OpenSignups";
import { stripeMode } from "@/lib/stripe";
import { attending, dinnerById, SEATED, signupsFor } from "@/lib/dinners";
import { displayPhone, longDate, money, moneyExact, shortDate, time } from "@/lib/format";
import type { Signup } from "@/lib/types";

export const dynamic = "force-dynamic";

const PILL: Record<string, { label: string; cls: string }> = {
  paid: { label: "Paid", cls: "" },
  comped: { label: "Comped", cls: "comp" },
  transferred: { label: "Transferred", cls: "" },
  refunded: { label: "Refunded", cls: "quiet" },
  overbooked: { label: "Refund me", cls: "comp" },
};

export default async function GuestList({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const dinner = await dinnerById(id);
  if (!dinner) notFound();

  const mode = stripeMode();

  const all = await signupsFor(dinner.id);
  const rows = attending(all);

  // A transferred seat is a paid seat with a different name on it. It counts
  // towards the room and towards the money, exactly like the SQL says.
  const seated = rows.filter((s) => SEATED.includes(s.status));
  const paid = seated.filter((s) => s.status === "paid" || s.status === "transferred");
  const comped = seated.filter((s) => s.status === "comped");
  const collected = paid.reduce((sum, s) => sum + (s.amount_paid_cents ?? 0), 0);
  const holds = all.filter(
    (s) => s.status === "pending" && s.hold_expires_at && new Date(s.hold_expires_at) > new Date()
  ).length;
  const remaining = Math.max(0, dinner.seats_total - seated.length - holds);

  const dietText = seated
    .filter((s) => s.dietary_restrictions)
    .map((s) => `${s.name}: ${s.dietary_restrictions}`)
    .join("\n");
  const phoneText = seated.map((s) => `${s.name} ${displayPhone(s.phone)}`).join("\n");

  return (
    <div className="body">
      <h1>{dinner.title}</h1>
      <p className="subline">
        {longDate(dinner.starts_at)} · {time(dinner.starts_at)}
        {dinner.full_address ? ` · ${dinner.full_address.replace(/\n/g, ", ")}` : ""} ·{" "}
        {money(dinner.price_cents)} · Code {dinner.access_code} ·{" "}
        {dinner.status === "open" ? "Signups open" : `Signups ${dinner.status}`} ·{" "}
        <Link className="crumb" href={`/admin/dinners/${dinner.id}`}>
          Edit
        </Link>
      </p>

      <p className={`stripemode ${mode}`}>
        Stripe: {mode === "live" ? "LIVE — real cards" : mode === "test" ? "TEST — no card is ever charged" : "KEY MISSING"}
      </p>

      <dl className="stats">
        <div className="stat">
          <dt>Seats</dt>
          <dd>{dinner.seats_total}</dd>
        </div>
        <div className="stat">
          <dt>Paid</dt>
          <dd>{paid.length}</dd>
        </div>
        <div className="stat">
          <dt>Comped</dt>
          <dd>{comped.length}</dd>
        </div>
        <div className="stat">
          <dt>Holds</dt>
          <dd>{holds}</dd>
        </div>
        <div className="stat">
          <dt>Remaining</dt>
          <dd>{remaining}</dd>
        </div>
        <div className="stat">
          <dt>Collected</dt>
          <dd>{money(collected)}</dd>
        </div>
      </dl>

      <div className="actions">
        <CopyButton label="Copy dietary restrictions" text={dietText} disabled={!dietText} />
        <CopyButton label="Copy phone numbers" text={phoneText} disabled={!phoneText} />
        <a className="abtn sec" href={`/admin/dinners/${dinner.id}/guests/export`}>
          Export CSV
        </a>
        <OpenSignups dinnerId={dinner.id} status={dinner.status} mode={mode} />
      </div>

      <AddGuestForm dinnerId={dinner.id} />

      {rows.length === 0 ? (
        <p className="empty">Nobody yet. The code has to go out first.</p>
      ) : (
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Phone</th>
                <th>Email</th>
                <th>Dietary restrictions</th>
                <th>Status</th>
                <th>Paid</th>
                <th>Signed up</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <GuestRow key={s.id} signup={s} dinnerId={dinner.id} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function GuestRow({ signup: s, dinnerId }: { signup: Signup; dinnerId: string }) {
  const pill = PILL[s.status] ?? { label: s.status, cls: "quiet" };
  return (
    <tr>
      <td>{s.name}</td>
      <td className="mono">{displayPhone(s.phone)}</td>
      <td>{s.email ?? <span className="none">&mdash;</span>}</td>
      <td>{s.dietary_restrictions ?? <span className="none">&mdash;</span>}</td>
      <td>
        <span className={`pill ${pill.cls}`}>{pill.label}</span>
      </td>
      <td className="mono">
        {s.amount_paid_cents != null && s.status !== "comped" ? (
          moneyExact(s.amount_paid_cents)
        ) : (
          <span className="none">&mdash;</span>
        )}
      </td>
      <td className="mono">{shortDate(s.created_at)}</td>
      <td>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
          {SEATED.includes(s.status) ? (
            <TransferGuest
              signupId={s.id}
              dinnerId={dinnerId}
              name={s.name}
              phone={s.phone}
            />
          ) : null}
          {s.status === "refunded" ? null : (
            <RemoveGuest
              signupId={s.id}
              dinnerId={dinnerId}
              name={s.name}
              refundable={Boolean(s.stripe_payment_intent)}
            />
          )}
        </div>
      </td>
    </tr>
  );
}
