import { headers } from "next/headers";
import { db } from "./supabase";

const MAX_ATTEMPTS = 5;
const WINDOW_MINUTES = 10;

export async function clientIp(): Promise<string> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return h.get("x-real-ip") ?? "unknown";
}

/** Five attempts per IP per ten minutes. A table is plenty; no Redis needed. */
export async function tooManyAttempts(ip: string): Promise<boolean> {
  const since = new Date(Date.now() - WINDOW_MINUTES * 60_000).toISOString();
  const { count, error } = await db()
    .from("code_attempts")
    .select("id", { count: "exact", head: true })
    .eq("ip", ip)
    .gte("attempted_at", since);

  if (error) throw error;
  return (count ?? 0) >= MAX_ATTEMPTS;
}

export async function recordAttempt(ip: string): Promise<void> {
  await db().from("code_attempts").insert({ ip });
}
