import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { env } from "@/lib/env";
import { db } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The webhook is the source of truth, not the redirect. People close the tab,
 * lose signal, get a call. `checkout.session.completed` flips a signup to paid;
 * the success page only reads the result.
 */
export async function POST(req: Request) {
  const signature = req.headers.get("stripe-signature");
  if (!signature) return new NextResponse("Missing signature", { status: 400 });

  const raw = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(raw, signature, env.stripeWebhookSecret);
  } catch (e) {
    console.error("[webhook] signature verification failed", e);
    return new NextResponse("Bad signature", { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        if (session.payment_status !== "paid") break;

        const { data, error } = await db().rpc("confirm_payment", {
          p_session_id: session.id,
          p_payment_intent:
            typeof session.payment_intent === "string"
              ? session.payment_intent
              : (session.payment_intent?.id ?? null),
          p_amount_cents: session.amount_total ?? 0,
        });

        if (error) {
          // Returning non-2xx makes Stripe retry, which is what we want for a
          // transient database problem.
          console.error("[webhook] confirm_payment failed", session.id, error);
          return new NextResponse("Could not record payment", { status: 500 });
        }

        const row = Array.isArray(data) ? data[0] : data;
        if (row?.status === "overbooked") {
          console.error(
            "[webhook] OVERBOOKED — charged but no seat. Refund manually:",
            row.id,
            row.stripe_payment_intent
          );
        }
        break;
      }

      case "checkout.session.expired": {
        const session = event.data.object;
        await db()
          .from("signups")
          .update({ status: "cancelled" })
          .eq("stripe_session_id", session.id)
          .eq("status", "pending");
        break;
      }

      case "charge.refunded": {
        const charge = event.data.object;
        const intentId =
          typeof charge.payment_intent === "string"
            ? charge.payment_intent
            : charge.payment_intent?.id;
        if (intentId) {
          // Refunds issued from the Stripe dashboard should show up here too.
          await db()
            .from("signups")
            .update({ status: "refunded" })
            .eq("stripe_payment_intent", intentId)
            .in("status", ["paid", "overbooked"]);
        }
        break;
      }

      default:
        break;
    }
  } catch (e) {
    console.error("[webhook] handler threw", event.type, e);
    return new NextResponse("Handler error", { status: 500 });
  }

  return NextResponse.json({ received: true });
}
