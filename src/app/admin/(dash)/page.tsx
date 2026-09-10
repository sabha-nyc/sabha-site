import Link from "next/link";
import { db } from "@/lib/supabase";
import { longDate, money, time } from "@/lib/format";
import type { Dinner, Signup } from "@/lib/types";

export const dynamic = "force-dynamic";

type Row = Dinner & { sold: number; collected: number };

function group(rows: Row[]) {
  const now = Date.now();
  const upcoming = rows.filter((d) => new Date(d.starts_at).getTime() >= now);
  const past = rows.filter((d) => new Date(d.starts_at).getTime() < now);
  return {
    open: upcoming.filter((d) => d.status === "open"),
    other: upcoming.filter((d) => d.status !== "open"),
    past,
  };
}

export default async function AdminHome() {
  const [{ data: dinners }, { data: signups }] = await Promise.all([
    db().from("dinners").select("*").order("starts_at", { ascending: false }),
    db().from("signups").select("dinner_id, status, amount_paid_cents"),
  ]);

  const rows: Row[] = ((dinners ?? []) as Dinner[]).map((d) => {
    const mine = ((signups ?? []) as Partial<Signup>[]).filter((s) => s.dinner_id === d.id);
    return {
      ...d,
      sold: mine.filter((s) => s.status === "paid" || s.status === "comped").length,
      collected: mine
        .filter((s) => s.status === "paid")
        .reduce((sum, s) => sum + (s.amount_paid_cents ?? 0), 0),
    };
  });

  const { open, other, past } = group(rows);

  return (
    <div className="body">
      <h1>Dinners</h1>
      <p className="subline">Everything, oldest at the bottom.</p>

      <div className="actions">
        <Link className="abtn" href="/admin/dinners/new">
          New dinner
        </Link>
      </div>

      {rows.length === 0 ? (
        <p className="empty">No dinners yet. The first one is a good place to start.</p>
      ) : null}

      <Section title="Open" rows={open} />
      <Section title="Draft and closed" rows={other} />
      <Section title="Past" rows={past} />
    </div>
  );
}

function Section({ title, rows }: { title: string; rows: Row[] }) {
  if (rows.length === 0) return null;
  return (
    <>
      <p className="sectionhead">{title}</p>
      <div className="cardlist">
        {rows.map((d) => (
          <div className="card" key={d.id}>
            <Link className="title" href={`/admin/dinners/${d.id}/guests`}>
              {d.title}
            </Link>
            <span className="meta">
              {longDate(d.starts_at)} · {time(d.starts_at)}
              {d.neighborhood ? ` · ${d.neighborhood}` : ""}
            </span>
            <span className="right">
              <span className="mono">
                {d.sold}/{d.seats_total}
              </span>
              <span className="mono">{money(d.collected)}</span>
              <span className={`pill ${d.status === "open" ? "" : "quiet"}`}>{d.status}</span>
              <Link className="crumb" href={`/admin/dinners/${d.id}`}>
                Edit
              </Link>
            </span>
          </div>
        ))}
      </div>
    </>
  );
}
