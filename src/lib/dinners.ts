import { db } from "./supabase";
import type { Dinner, Signup } from "./types";

export async function dinnerBySlug(slug: string): Promise<Dinner | null> {
  const { data, error } = await db().from("dinners").select("*").eq("slug", slug).maybeSingle();
  if (error) throw error;
  return (data as Dinner) ?? null;
}

export async function dinnerById(id: string): Promise<Dinner | null> {
  const { data, error } = await db().from("dinners").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return (data as Dinner) ?? null;
}

/** Codes are compared case-insensitively and trimmed — people paste from a text. */
export async function dinnerByCode(code: string): Promise<Dinner | null> {
  const normalized = code.trim().toLowerCase();
  if (!normalized) return null;

  const { data, error } = await db()
    .from("dinners")
    .select("*")
    .eq("access_code_normalized", normalized)
    .neq("status", "draft")
    .maybeSingle();

  if (error) throw error;
  return (data as Dinner) ?? null;
}

export async function seatsRemaining(dinnerId: string): Promise<number> {
  const { data, error } = await db()
    .from("dinner_availability")
    .select("seats_remaining")
    .eq("id", dinnerId)
    .maybeSingle();
  if (error) throw error;
  return Math.max(0, Number(data?.seats_remaining ?? 0));
}

export async function signupsFor(dinnerId: string): Promise<Signup[]> {
  const { data, error } = await db()
    .from("signups")
    .select("*")
    .eq("dinner_id", dinnerId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Signup[];
}

/** Rows the host cares about: anyone who is coming, or paid and needs sorting out. */
export function attending(signups: Signup[]): Signup[] {
  return signups.filter((s) => ["paid", "comped", "overbooked", "refunded"].includes(s.status));
}

export async function signupByToken(token: string): Promise<Signup | null> {
  const { data, error } = await db()
    .from("signups")
    .select("*")
    .eq("details_token", token)
    .maybeSingle();
  if (error) throw error;
  return (data as Signup) ?? null;
}
