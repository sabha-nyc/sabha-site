"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/supabase";
import { stripe } from "@/lib/stripe";
import { env } from "@/lib/env";
import { grantAccess, hasAccess } from "@/lib/access";
import { clientIp, recordAttempt, tooManyAttempts } from "@/lib/rate-limit";
import { dinnerByCode, dinnerBySlug } from "@/lib/dinners";
import { toE164 } from "@/lib/format";
import type { Signup } from "@/lib/types";

export type FormState = { error: string | null };

// ───────────────────────────────────────────────────────── code entry

export async function enterCode(_prev: FormState, form: FormData): Promise<FormState> {
  const code = String(form.get("code") ?? "");
  if (!code.trim()) return { error: "Enter the code from your invitation." };

  const ip = await clientIp();
  if (await tooManyAttempts("code", ip)) {
    return { error: "Too many tries. Give it ten minutes." };
  }
  await recordAttempt("code", ip);

  const dinner = await dinnerByCode(code);
  // Never confirm whether a dinner exists at a guessed slug.
  if (!dinner) return { error: "That code isn't right." };

  await grantAccess(dinner.slug);
  redirect(`/d/${dinner.slug}`);
}

// ─────────────────────────────────────────────────── hold seat + checkout

const HOLD_ERRORS: Record<string, string> = {
  sold_out: "That was the last seat. Try the next dinner.",
  signups_closed: "Signups for this dinner are closed.",
  duplicate_phone: "That number already has a seat for this dinner.",
  dinner_not_found: "That code isn't right.",
};

export async function startCheckout(_prev: FormState, form: FormData): Promise<FormState> {
  const slug = String(form.get("slug") ?? "");
  const name = String(form.get("name") ?? "").trim();
  const phoneRaw = String(form.get("phone") ?? "");
  const diet = String(form.get("dietary_restrictions") ?? "");

  if (!(await hasAccess(slug))) redirect("/");

  const dinner = await dinnerBySlug(slug);
  if (!dinner) redirect("/");

  if (!name) return { error: "We need a name for the door." };

  const phone = toE164(phoneRaw);
  if (!phone) return { error: "That phone number doesn't look right." };

  // Holding a seat costs nothing, so it has to cost something. Without this
  // one person can sit on every seat, fifteen minutes at a time, forever.
  const ip = await clientIp();
  if (await tooManyAttempts("hold", ip)) {
    return { error: "Too many held seats from here. Give it half an hour." };
  }
  await recordAttempt("hold", ip);

  const { data, error } = await db().rpc("hold_seat", {
    p_dinner_id: dinner.id,
    p_name: name,
    p_phone: phone,
    p_diet: diet,
    p_hold_minutes: env.seatHoldMinutes,
  });

  if (error) {
    const key = Object.keys(HOLD_ERRORS).find((k) => error.message.includes(k));
    if (key === "sold_out") redirect(`/d/${slug}/full`);
    return { error: key ? HOLD_ERRORS[key]! : "Something went wrong. Try again." };
  }

  const signup = (Array.isArray(data) ? data[0] : data) as Signup;

  let checkoutUrl: string;
  try {
    const session = await stripe().checkout.sessions.create(
      {
        mode: "payment",
        // Pinned to card on purpose. Left unset, Stripe may offer an
        // asynchronous method whose session completes as 'unpaid' and settles
        // days later — a guest holding a confirmation for a seat nobody has
        // been paid for.
        payment_method_types: ["card"],
        // We already ask for a phone on our own form. If Checkout asks anyway,
        // it is the account-level setting in the Stripe dashboard, not this.
        phone_number_collection: { enabled: false },
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: "usd",
              unit_amount: dinner.price_cents,
              product_data: {
                name: dinner.title,
                description: [
                  dinner.neighborhood,
                  "One seat",
                  "Non-refundable — transferable up to the day of the dinner",
                ]
                  .filter(Boolean)
                  .join(" · "),
              },
            },
          },
        ],
        // The webhook is the source of truth. The success page only reads the result.
        success_url: `${env.siteUrl}/d/${dinner.slug}/confirmed?t=${signup.details_token}`,
        cancel_url: `${env.siteUrl}/d/${dinner.slug}`,
        client_reference_id: signup.id,
        metadata: { signup_id: signup.id, dinner_id: dinner.id },
        payment_intent_data: { statement_descriptor_suffix: "SABHA DINNER" },
        // Stripe's floor is 30 minutes, so this can't match the 15-minute
        // hold exactly. It still matters: the default is 24 hours, which lets
        // a checkout complete a day after its hold died and land in
        // 'overbooked'. 30 minutes bounds that window to one hold plus one.
        expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
      },
      // If the guest double-submits, Stripe returns the same session rather
      // than charging twice.
      { idempotencyKey: `signup_${signup.id}` }
    );

    if (!session.url) throw new Error("Stripe returned no checkout URL");

    await db().from("signups").update({ stripe_session_id: session.id }).eq("id", signup.id);
    checkoutUrl = session.url;
  } catch (e) {
    // Don't leave a dead hold sitting on a seat.
    await db().from("signups").update({ status: "cancelled" }).eq("id", signup.id);
    console.error("[checkout] failed to create session", e);
    return { error: "We couldn't reach the card processor. Try again." };
  }

  redirect(checkoutUrl);
}
