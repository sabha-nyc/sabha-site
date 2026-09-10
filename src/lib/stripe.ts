import Stripe from "stripe";
import { env } from "./env";

let stripeClient: Stripe | null = null;

export function stripe(): Stripe {
  if (!stripeClient) {
    stripeClient = new Stripe(env.stripeSecretKey, { apiVersion: "2025-02-24.acacia" });
  }
  return stripeClient;
}
