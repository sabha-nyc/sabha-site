import { env } from "./env";

/**
 * One alert, sent to the people on the allowlist. A log line nobody reads is
 * not an alert.
 *
 * Delivery is best-effort on purpose: an alert that fails must never take a
 * webhook down with it, because a 500 makes Stripe retry a payment we have
 * already recorded. If email isn't configured the message still goes to the
 * server log, and /admin carries the banner regardless.
 */
export async function alertAdmins(subject: string, body: string): Promise<void> {
  const to = env.adminEmails;
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.ALERT_EMAIL_FROM;

  if (!apiKey || !from || to.length === 0) {
    console.error(`[alert] (email not configured) ${subject}\n${body}`);
    return;
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to, subject, text: body }),
    });

    if (!res.ok) {
      console.error(`[alert] send failed ${res.status}`, await res.text().catch(() => ""));
    }
  } catch (e) {
    console.error("[alert] send threw", e);
  }
}
