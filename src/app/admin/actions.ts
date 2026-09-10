"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/supabase";
import { stripe } from "@/lib/stripe";
import { env } from "@/lib/env";
import { authClient, requireAdmin } from "@/lib/auth";
import { normalizePhone } from "@/lib/format";
import type { Dinner } from "@/lib/types";

export type AdminState = { error: string | null; ok?: string | null };

// ───────────────────────────────────────────────────────────── auth

export async function sendMagicLink(_prev: AdminState, form: FormData): Promise<AdminState> {
  const email = String(form.get("email") ?? "")
    .trim()
    .toLowerCase();

  const neutral = { error: null, ok: "If that address is on the list, a link is on its way." };
  if (!email || !env.adminEmails.includes(email)) return neutral;

  const supabase = await authClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true,
      emailRedirectTo: `${env.siteUrl}/admin/auth/callback`,
    },
  });

  if (error) {
    console.error("[admin] magic link failed", error);
    return { error: "Couldn't send the link. Try again." };
  }
  return neutral;
}

export async function signOut(): Promise<void> {
  const supabase = await authClient();
  await supabase.auth.signOut();
  redirect("/admin/login");
}

// ────────────────────────────────────────────────────────── dinners

/** "2026-10-12T19:30" typed by a host in New York is 19:30 in New York. */
function newYorkToUtc(local: string): string {
  const naive = new Date(`${local}:00Z`).getTime();
  const tzName = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    timeZoneName: "longOffset",
  })
    .formatToParts(new Date(naive))
    .find((p) => p.type === "timeZoneName")!.value; // e.g. "GMT-04:00"
  const match = /GMT([+-])(\d{1,2})(?::(\d{2}))?/.exec(tzName);
  const sign = match?.[1] === "-" ? -1 : 1;
  const offsetMs = sign * (Number(match?.[2] ?? 0) * 60 + Number(match?.[3] ?? 0)) * 60_000;
  return new Date(naive - offsetMs).toISOString();
}

type DinnerValues = {
  title: string;
  slug: string;
  starts_at: string;
  neighborhood: string | null;
  full_address: string | null;
  price_cents: number;
  seats_total: number;
  access_code: string;
  details_note: string | null;
  host_phone: string | null;
  status: Dinner["status"];
};

type ParsedDinner = { ok: false; error: string } | { ok: true; values: DinnerValues };

function parseDinnerForm(form: FormData): ParsedDinner {
  const title = String(form.get("title") ?? "").trim();
  const slug = String(form.get("slug") ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const startsAtLocal = String(form.get("starts_at") ?? "").trim();
  const priceDollars = Number(form.get("price") ?? NaN);
  const seatsTotal = Number(form.get("seats_total") ?? NaN);
  const accessCode = String(form.get("access_code") ?? "").trim();

  if (!title) return { ok: false, error: "The dinner needs a title." };
  if (!slug) return { ok: false, error: "The dinner needs a slug." };
  if (!startsAtLocal) return { ok: false, error: "When does it start?" };
  if (!Number.isFinite(priceDollars) || priceDollars < 0)
    return { ok: false, error: "That price doesn't look right." };
  if (!Number.isInteger(seatsTotal) || seatsTotal < 1)
    return { ok: false, error: "Seats has to be a whole number, one or more." };
  if (!accessCode) return { ok: false, error: "The dinner needs an access code." };

  return {
    ok: true,
    values: {
      title,
      slug,
      starts_at: newYorkToUtc(startsAtLocal),
      neighborhood: String(form.get("neighborhood") ?? "").trim() || null,
      full_address: String(form.get("full_address") ?? "").trim() || null,
      price_cents: Math.round(priceDollars * 100),
      seats_total: seatsTotal,
      access_code: accessCode,
      details_note: String(form.get("details_note") ?? "").trim() || null,
      host_phone: String(form.get("host_phone") ?? "").trim() || null,
      status: (String(form.get("status") ?? "draft") as Dinner["status"]) || "draft",
    },
  };
}

export async function createDinner(_prev: AdminState, form: FormData): Promise<AdminState> {
  await requireAdmin();
  const parsed = parseDinnerForm(form);
  if (!parsed.ok) return { error: parsed.error };

  const { data, error } = await db().from("dinners").insert(parsed.values).select("id").single();
  if (error) {
    if (error.code === "23505") return { error: "That slug or access code is already taken." };
    console.error("[admin] createDinner", error);
    return { error: "Couldn't save the dinner." };
  }

  revalidatePath("/admin");
  redirect(`/admin/dinners/${data.id}`);
}

export async function updateDinner(_prev: AdminState, form: FormData): Promise<AdminState> {
  await requireAdmin();
  const id = String(form.get("id") ?? "");
  const parsed = parseDinnerForm(form);
  if (!parsed.ok) return { error: parsed.error };

  // Changing the price never touches people who have already paid — nothing
  // here writes to signups.
  const { error } = await db().from("dinners").update(parsed.values).eq("id", id);
  if (error) {
    if (error.code === "23505") return { error: "That slug or access code is already taken." };
    console.error("[admin] updateDinner", error);
    return { error: "Couldn't save the dinner." };
  }

  revalidatePath("/admin");
  revalidatePath(`/admin/dinners/${id}`);
  return { error: null, ok: "Saved." };
}

export async function setDinnerStatus(form: FormData): Promise<void> {
  await requireAdmin();
  const id = String(form.get("id") ?? "");
  const status = String(form.get("status") ?? "");
  if (!["draft", "open", "closed"].includes(status)) return;

  await db().from("dinners").update({ status }).eq("id", id);
  revalidatePath("/admin");
  revalidatePath(`/admin/dinners/${id}`);
  revalidatePath(`/admin/dinners/${id}/guests`);
}

// ────────────────────────────────────────────────────────── guests

export async function addGuest(_prev: AdminState, form: FormData): Promise<AdminState> {
  await requireAdmin();
  const dinnerId = String(form.get("dinner_id") ?? "");
  const name = String(form.get("name") ?? "").trim();
  const phone = normalizePhone(String(form.get("phone") ?? ""));
  const diet = String(form.get("dietary_restrictions") ?? "").trim() || null;

  if (!name) return { error: "The guest needs a name." };
  if (phone.length !== 10) return { error: "That phone number doesn't look right." };

  // A comped row with its own details token, and no charge.
  const { error } = await db().from("signups").insert({
    dinner_id: dinnerId,
    name,
    phone,
    dietary_restrictions: diet,
    status: "comped",
  });

  if (error) {
    if (error.code === "23505") return { error: "That number already has a seat." };
    console.error("[admin] addGuest", error);
    return { error: "Couldn't add the guest." };
  }

  revalidatePath(`/admin/dinners/${dinnerId}/guests`);
  return { error: null, ok: `${name} added.` };
}

export async function removeGuest(form: FormData): Promise<void> {
  await requireAdmin();
  const id = String(form.get("signup_id") ?? "");
  const dinnerId = String(form.get("dinner_id") ?? "");
  const refund = form.get("refund") === "on";

  const { data: signup } = await db()
    .from("signups")
    .select("id, stripe_payment_intent, status")
    .eq("id", id)
    .maybeSingle();

  if (!signup) return;

  let status = "cancelled";

  if (refund && signup.stripe_payment_intent) {
    try {
      await stripe().refunds.create(
        { payment_intent: signup.stripe_payment_intent },
        { idempotencyKey: `refund_${signup.id}` }
      );
      status = "refunded";
    } catch (e) {
      console.error("[admin] refund failed", signup.id, e);
      // Leave the row alone rather than marking someone refunded who isn't.
      return;
    }
  }

  await db().from("signups").update({ status }).eq("id", id);
  revalidatePath(`/admin/dinners/${dinnerId}/guests`);
}
