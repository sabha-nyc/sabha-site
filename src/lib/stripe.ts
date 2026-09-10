import Stripe from "stripe";
import { env } from "./env";

let stripeClient: Stripe | null = null;

export function stripe(): Stripe {
  if (!stripeClient) {
    stripeClient = new Stripe(env.stripeSecretKey, { apiVersion: "2025-02-24.acacia" });
  }
  return stripeClient;
}

export type StripeMode = "test" | "live" | "unknown";

/**
 * Which Stripe account the key points at. Read from the key prefix rather than
 * a separate flag, because a separate flag can disagree with the key and the
 * key is what actually takes the money.
 */
export function stripeMode(): StripeMode {
  const key = process.env.STRIPE_SECRET_KEY ?? "";
  if (key.startsWith("sk_test_") || key.startsWith("rk_test_")) return "test";
  if (key.startsWith("sk_live_") || key.startsWith("rk_live_")) return "live";
  return "unknown";
}
