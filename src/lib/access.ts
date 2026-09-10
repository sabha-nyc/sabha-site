import { cookies } from "next/headers";
import { env } from "./env";

const COOKIE = "sabha_access";
const TTL_SECONDS = 60 * 60; // one hour

function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return Buffer.from(arr).toString("base64url");
}

async function key(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(env.sessionSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
}

async function sign(payload: string): Promise<string> {
  const mac = await crypto.subtle.sign("HMAC", await key(), new TextEncoder().encode(payload));
  return b64url(mac);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * A valid code sets a signed, httpOnly cookie scoped to that dinner's slug,
 * good for one hour. That is what gates the rest of the flow.
 */
export async function grantAccess(slug: string): Promise<void> {
  const exp = Math.floor(Date.now() / 1000) + TTL_SECONDS;
  const payload = `${slug}.${exp}`;
  const value = `${payload}.${await sign(payload)}`;
  const jar = await cookies();
  jar.set(COOKIE, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: TTL_SECONDS,
  });
}

export async function hasAccess(slug: string): Promise<boolean> {
  const jar = await cookies();
  const raw = jar.get(COOKIE)?.value;
  if (!raw) return false;

  const lastDot = raw.lastIndexOf(".");
  if (lastDot < 0) return false;
  const payload = raw.slice(0, lastDot);
  const mac = raw.slice(lastDot + 1);

  const [cookieSlug, expStr] = payload.split(".");
  if (cookieSlug !== slug) return false;
  if (!Number(expStr) || Number(expStr) * 1000 < Date.now()) return false;

  return timingSafeEqual(mac, await sign(payload));
}

export async function clearAccess(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE);
}
