"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/supabase";
import { stripe, stripeMode } from "@/lib/stripe";
import { env } from "@/lib/env";
import { authClient, requireAdmin } from "@/lib/auth";
import { dinnerById } from "@/lib/dinners";
import { toE164 } from "@/lib/format";
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
  // Deliberately no status — see parseDinnerForm.
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

  // host_phone is a phone number like any other. It was going in with a bare
  // trim, so "(704) 898-3986" would have been stored verbatim and the
  // sms: link on the confirmation page would have been malformed.
  const hostPhoneRaw = String(form.get("host_phone") ?? "").trim();
  const hostPhone = hostPhoneRaw ? toE164(hostPhoneRaw) : null;

  if (!title) return { ok: false, error: "The dinner needs a title." };
  if (!slug) return { ok: false, error: "The dinner needs a slug." };
  if (!startsAtLocal) return { ok: false, error: "When does it start?" };
  if (!Number.isFinite(priceDollars) || priceDollars < 0)
    return { ok: false, error: "That price doesn't look right." };
  if (!Number.isInteger(seatsTotal) || seatsTotal < 1)
    return { ok: false, error: "Seats has to be a whole number, one or more." };
  if (!accessCode) return { ok: false, error: "The dinner needs an access code." };
  if (hostPhoneRaw && !hostPhone)
    return { ok: false, error: "That host phone number doesn't look right." };

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
      host_phone: hostPhone,
      // No status. The dinner form must never be able to set one — otherwise
      // the edit page is a second, ungated door to 'open' and the Stripe check
      // in setDinnerStatus is decoration. Status moves only through
      // setDinnerStatus, which carries both gates.
    },
  };
}

export async function createDinner(_prev: AdminState, form: FormData): Promise<AdminState> {
  await requireAdmin();
  const parsed = parseDinnerForm(form);
  if (!parsed.ok) return { error: parsed.error };

  // Always born a draft. Nothing is reachable until someone opens it on the
  // guest list, past the Stripe check.
  const { data, error } = await db()
    .from("dinners")
    .insert({ ...parsed.values, status: "draft" })
    .select("id")
    .single();
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

/**
 * Opening signups is the one irreversible-feeling action here: from the moment
 * it flips, strangers can pay. Two gates sit in front of it.
 *
 * The first is not a confirmation, it is a refusal. With a test key, Checkout
 * happily completes and charges nobody — forty people would believe they had
 * a seat at a dinner that had taken no money. No amount of "are you sure"
 * makes that a decision worth offering, so it simply cannot be done.
 *
 * The second, once the key is live, is a typed confirmation. Closing is never
 * gated: stopping sales is always allowed to be easy.
 */
export async function setDinnerStatus(_prev: AdminState, form: FormData): Promise<AdminState> {
  await requireAdmin();
  const id = String(form.get("id") ?? "");
  const status = String(form.get("status") ?? "");
  if (!["draft", "open", "closed"].includes(status)) return { error: "Unknown status." };

  if (status === "open") {
    const mode = stripeMode();
    if (mode === "test") {
      return {
        error:
          "Stripe is in test mode. Opening signups would let guests book seats " +
          "that never charge a card. Do the live rehearsal, put the live key in, " +
          "then come back.",
      };
    }
    if (mode !== "live") {
      return {
        error:
          "STRIPE_SECRET_KEY is missing or unrecognised, so payments can't be " +
          "trusted. Signups stay shut until that is fixed.",
      };
    }

    const dinner = await dinnerById(id);
    if (!dinner) return { error: "That dinner is gone." };

    const typed = String(form.get("confirm") ?? "").trim().toLowerCase();
    if (typed !== dinner.access_code.trim().toLowerCase()) {
      return { error: `Type the access code exactly to open signups.` };
    }
  }

  const { error } = await db().from("dinners").update({ status }).eq("id", id);
  if (error) {
    console.error("[admin] setDinnerStatus", error);
    return { error: "Couldn't change the status." };
  }

  revalidatePath("/admin");
  revalidatePath(`/admin/dinners/${id}`);
  revalidatePath(`/admin/dinners/${id}/guests`);
  return {
    error: null,
    ok: status === "open" ? "Signups are open. Seats can now be paid for." : `Signups ${status}.`,
  };
}

// ────────────────────────────────────────────────────────── guests

export async function addGuest(_prev: AdminState, form: FormData): Promise<AdminState> {
  await requireAdmin();
  const dinnerId = String(form.get("dinner_id") ?? "");
  const name = String(form.get("name") ?? "").trim();
  const phone = toE164(String(form.get("phone") ?? ""));
  const diet = String(form.get("dietary_restrictions") ?? "").trim() || null;

  if (!name) return { error: "The guest needs a name." };
  if (!phone) return { error: "That phone number doesn't look right." };

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

/**
 * Transfer a seat. Seats are non-refundable, so this is the only remedy a
 * guest has — and a guest with no remedy files a chargeback instead.
 *
 * The row keeps its id, its details_token and its stripe_payment_intent,
 * because the person who paid is still the person who paid. Only the name and
 * the phone change, and the status records that they did. The details link
 * already in the original guest's text keeps working, which is exactly how
 * they hand the seat over.
 */
export async function transferGuest(_prev: AdminState, form: FormData): Promise<AdminState> {
  await requireAdmin();
  const id = String(form.get("signup_id") ?? "");
  const dinnerId = String(form.get("dinner_id") ?? "");
  const name = String(form.get("name") ?? "").trim();
  const phone = toE164(String(form.get("phone") ?? ""));

  if (!name) return { error: "The new guest needs a name." };
  if (!phone) return { error: "That phone number doesn't look right." };

  const { data: current } = await db()
    .from("signups")
    .select("id, status, name, phone")
    .eq("id", id)
    .maybeSingle();

  if (!current) return { error: "That guest is gone." };
  if (!["paid", "comped", "transferred"].includes(current.status)) {
    return { error: `A ${current.status} seat can't be transferred.` };
  }

  // A comped seat handed on is still a comped seat — no money moved, and
  // saying otherwise would put it in the collected column.
  const status = current.status === "comped" ? "comped" : "transferred";

  const { error } = await db()
    .from("signups")
    .update({ name, phone, status })
    .eq("id", id);

  if (error) {
    if (error.code === "23505") return { error: "That number already has a seat at this dinner." };
    console.error("[admin] transferGuest", error);
    return { error: "Couldn't transfer the seat." };
  }

  revalidatePath(`/admin/dinners/${dinnerId}/guests`);
  return { error: null, ok: `Seat transferred to ${name}. Their details link is unchanged.` };
}
