import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { env } from "@/lib/env";
import { db } from "@/lib/supabase";
import { alertAdmins, sendGuestConfirmation } from "@/lib/alerts";
import { dinnerById } from "@/lib/dinners";

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

        // Checkout always collects an email, so we take it from there rather
        // than asking for it a second time on our own form. Stored whatever
        // the outcome — an overbooked guest is precisely someone we need to be
        // able to write to.
        const guestEmail = session.customer_details?.email ?? null;
        if (guestEmail && row?.id) {
          const { error: emailError } = await db()
            .from("signups")
            .update({ email: guestEmail })
            .eq("id", row.id);
          if (emailError) {
            // Not worth a retry: the payment is recorded and the address is a
            // convenience. Loud, but not fatal.
            console.error("[webhook] could not store guest email", row.id, emailError);
          }
        }

        if (row?.status === "paid" && guestEmail) {
          const dinner = await dinnerById(row.dinner_id);
          if (dinner) {
            const sent = await sendGuestConfirmation(guestEmail, dinner, row);
            if (!sent) {
              // Deliberately NOT a 500. Stripe must not retry a payment we
              // have already recorded just because an email bounced — the
              // guest can still reach their details from the success page.
              console.error(
                "[webhook] CONFIRMATION EMAIL FAILED — guest is paid and seated but was not written to:",
                row.id,
                guestEmail
              );
            }
          }
        }

        if (row?.status === "overbooked") {
          console.error(
            "[webhook] OVERBOOKED — charged but no seat. Refund manually:",
            row.id,
            row.stripe_payment_intent
          );
          // Awaited, but alertAdmins never throws — a failed alert must not
          // turn into a 500, because Stripe would retry a payment we have
          // already recorded.
          await alertAdmins(
            "Sabha — a seat was paid for that no longer exists",
            [
              `${row.name} (${row.phone}) paid for a seat that had already gone.`,
              "",
              "They have been charged and they are not on the list. This needs a",
              "refund from the Stripe dashboard, and a text to say so.",
              "",
              `Payment intent: ${row.stripe_payment_intent}`,
              `Signup: ${row.id}`,
              `Guest list: ${env.siteUrl}/admin/dinners/${row.dinner_id}/guests`,
            ].join("\n")
          );
        }
        break;
      }

      case "checkout.session.expired": {
        // Errors are deliberately swallowed here: an unhandled expiry
        // self-heals, because the hold ages out and the seat count is a query.
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
        if (!intentId) break;

        // Only a full refund gives the seat back. A partial refund is a
        // goodwill gesture to someone who is still coming to dinner, and
        // freeing their seat would sell it out from under them.
        if (charge.amount_refunded < charge.amount) {
          console.log(
            "[webhook] partial refund, seat kept:",
            intentId,
            `${charge.amount_refunded} of ${charge.amount}`
          );
          break;
        }

        // Refunds issued from the Stripe dashboard should show up here too.
        const { error: refundError } = await db()
          .from("signups")
          .update({ status: "refunded" })
          .eq("stripe_payment_intent", intentId)
          .in("status", ["paid", "overbooked"]);

        if (refundError) {
          // A refunded guest left as 'paid' holds a seat forever, and nothing
          // else in the system will ever notice. Make Stripe retry.
          console.error("[webhook] refund sync failed", intentId, refundError);
          return new NextResponse("Could not record refund", { status: 500 });
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
