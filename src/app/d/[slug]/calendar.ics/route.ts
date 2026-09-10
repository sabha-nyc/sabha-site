import { dinnerBySlug, SEATED, signupByToken } from "@/lib/dinners";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function esc(v: string): string {
  return v
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

function stamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** The address is in the invite, so this is gated on the token like the page. */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const token = new URL(req.url).searchParams.get("t");
  if (!token) return new Response("Not found", { status: 404 });

  const signup = await signupByToken(token);
  const dinner = await dinnerBySlug(slug);
  if (!signup || !dinner || signup.dinner_id !== dinner.id) {
    return new Response("Not found", { status: 404 });
  }
  if (!SEATED.includes(signup.status)) {
    return new Response("Not found", { status: 404 });
  }

  const start = new Date(dinner.starts_at);
  const end = new Date(start.getTime() + 3 * 60 * 60 * 1000);

  const body = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Sabha//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${signup.id}@sabha`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${esc(dinner.title)}`,
    `LOCATION:${esc((dinner.full_address ?? "").replace(/\n/g, ", "))}`,
    dinner.details_note ? `DESCRIPTION:${esc(dinner.details_note)}` : null,
    "END:VEVENT",
    "END:VCALENDAR",
  ]
    .filter(Boolean)
    .join("\r\n");

  return new Response(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${slug}.ics"`,
      "Cache-Control": "no-store",
    },
  });
}
