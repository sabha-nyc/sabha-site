/**
 * Environment validation, run once at module load.
 *
 * This used to be lazy: each getter threw the first time something touched it.
 * That meant a completely unconfigured deployment built cleanly, served the
 * homepage, and only fell over when a guest typed their code — surfacing as
 * the error boundary's "Something broke", which is indistinguishable from a
 * transient fault. A site that was never configured looked like a glitch.
 *
 * Now a missing variable fails the build instead of the guest's signup.
 * Every server module imports this one, so the throw happens while Next is
 * collecting page data and the deploy never goes live.
 *
 * Server-only. Nothing marked "use client" may import this, or the throw
 * lands in the browser bundle.
 */

const REQUIRED = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "SESSION_SECRET",
  "ADMIN_EMAILS",
  "NEXT_PUBLIC_SITE_URL",
] as const;

/** Absent is survivable, but say so out loud — each one silently degrades something. */
const OPTIONAL: Record<string, string> = {
  RESEND_API_KEY: "overbooked alerts fall back to the server log; nobody is emailed",
  ALERT_EMAIL_FROM: "overbooked alerts fall back to the server log; nobody is emailed",
  SEAT_HOLD_MINUTES: "defaults to 15",
};

function read(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : undefined;
}

function validate(): void {
  const missing = REQUIRED.filter((name) => !read(name));

  if (missing.length > 0) {
    throw new Error(
      [
        `Missing required environment variable${missing.length > 1 ? "s" : ""}:`,
        ...missing.map((n) => `  - ${n}`),
        "",
        "Locally these live in .env.local (see .env.example).",
        "On Vercel: Settings -> Environment Variables, then redeploy.",
      ].join("\n")
    );
  }

  // Nothing announces this one. The build succeeds, the site loads, and every
  // Stripe redirect and confirmation link points at somebody's laptop.
  const siteUrl = read("NEXT_PUBLIC_SITE_URL")!;
  if (process.env.NODE_ENV === "production" && /localhost|127\.0\.0\.1/i.test(siteUrl)) {
    throw new Error(
      [
        `NEXT_PUBLIC_SITE_URL is "${siteUrl}" in a production build.`,
        "",
        "Stripe success/cancel URLs and every confirmation link are built from",
        "this value, so guests would be sent to a laptop that isn't listening.",
        "Set it to the deployed origin, e.g. https://sabha-site.vercel.app",
      ].join("\n")
    );
  }

  const degraded = Object.keys(OPTIONAL).filter((name) => !read(name));
  // Prints once per build worker, so a few times per build. Left noisy on
  // purpose: it is cheaper to skim a repeated warning than to miss it.
  if (degraded.length > 0) {
    console.warn(
      [
        `[env] optional variable${degraded.length > 1 ? "s" : ""} not set:`,
        ...degraded.map((n) => `  - ${n} — ${OPTIONAL[n]}`),
      ].join("\n")
    );
  }
}

validate();

export const env = {
  get supabaseUrl() {
    return read("NEXT_PUBLIC_SUPABASE_URL")!;
  },
  get supabaseAnonKey() {
    return read("NEXT_PUBLIC_SUPABASE_ANON_KEY")!;
  },
  get supabaseServiceKey() {
    return read("SUPABASE_SERVICE_ROLE_KEY")!;
  },
  get stripeSecretKey() {
    return read("STRIPE_SECRET_KEY")!;
  },
  get stripeWebhookSecret() {
    return read("STRIPE_WEBHOOK_SECRET")!;
  },
  get sessionSecret() {
    return read("SESSION_SECRET")!;
  },
  get siteUrl() {
    return read("NEXT_PUBLIC_SITE_URL")!.replace(/\/$/, "");
  },
  get adminEmails(): string[] {
    return (read("ADMIN_EMAILS") ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
  },
  get seatHoldMinutes(): number {
    const n = Number(read("SEAT_HOLD_MINUTES"));
    return Number.isFinite(n) && n > 0 ? n : 15;
  },
};
