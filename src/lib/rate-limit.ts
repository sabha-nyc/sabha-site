import { headers } from "next/headers";
import { db } from "./supabase";

/**
 * Two different abuses, two different limits, one table.
 *
 *  code — guessing access codes. Five per IP per ten minutes.
 *  hold — placing a seat hold and walking away. Without this, one person can
 *         sit on every seat for fifteen minutes at a time and never pay.
 *         The phone check inside hold_seat stops the same number holding
 *         twice, so the IP is the lever that's left.
 */
const LIMITS = {
  code: { max: 5, windowMinutes: 10 },
  hold: { max: 5, windowMinutes: 30 },
} as const;

export type AttemptKind = keyof typeof LIMITS;

export async function clientIp(): Promise<string> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return h.get("x-real-ip") ?? "unknown";
}

export async function tooManyAttempts(kind: AttemptKind, ip: string): Promise<boolean> {
  const { max, windowMinutes } = LIMITS[kind];
  const since = new Date(Date.now() - windowMinutes * 60_000).toISOString();

  const { count, error } = await db()
    .from("code_attempts")
    .select("id", { count: "exact", head: true })
    .eq("kind", kind)
    .eq("ip", ip)
    .gte("attempted_at", since);

  // A rate limiter that fails open is a rate limiter that isn't there.
  if (error) throw error;
  return (count ?? 0) >= max;
}

export async function recordAttempt(kind: AttemptKind, ip: string): Promise<void> {
  const { error } = await db().from("code_attempts").insert({ kind, ip });
  if (error) console.error("[rate-limit] could not record attempt", kind, error);
}
