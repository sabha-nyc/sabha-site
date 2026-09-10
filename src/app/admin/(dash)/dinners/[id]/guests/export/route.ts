import { requireAdmin } from "@/lib/auth";
import { attending, dinnerById, signupsFor } from "@/lib/dinners";
import { displayPhone, shortDate } from "@/lib/format";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function cell(v: string | number | null | undefined): string {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();

  const { id } = await params;
  const dinner = await dinnerById(id);
  if (!dinner) return new Response("Not found", { status: 404 });

  const rows = attending(await signupsFor(dinner.id));

  const csv = [
    ["Name", "Phone", "Dietary restrictions", "Status", "Paid", "Signed up"],
    ...rows.map((s) => [
      s.name,
      displayPhone(s.phone),
      s.dietary_restrictions ?? "",
      s.status,
      s.amount_paid_cents != null ? (s.amount_paid_cents / 100).toFixed(2) : "",
      shortDate(s.created_at),
    ]),
  ]
    .map((r) => r.map(cell).join(","))
    .join("\r\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${dinner.slug}-guests.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
