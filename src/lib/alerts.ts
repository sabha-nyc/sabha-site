import { env } from "./env";
import { longDate, time } from "./format";
import type { Dinner, Signup } from "./types";

/**
 * Every outbound email goes through here, and none of them can throw.
 *
 * Delivery is best-effort on purpose: a failed send must never take a webhook
 * down with it, because a non-2xx makes Stripe retry a payment we have already
 * recorded. Failures are logged loudly instead — and for the overbooked alert,
 * /admin carries the banner regardless.
 */
async function send(to: string[], subject: string, body: string, tag: string): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.ALERT_EMAIL_FROM;

  if (!apiKey || !from || to.length === 0) {
    console.error(`[${tag}] (email not configured) ${subject}\n${body}`);
    return false;
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
      console.error(
        `[${tag}] SEND FAILED ${res.status} to=${to.join(",")} subject="${subject}"`,
        await res.text().catch(() => "")
      );
      return false;
    }
    return true;
  } catch (e) {
    console.error(`[${tag}] SEND THREW to=${to.join(",")} subject="${subject}"`, e);
    return false;
  }
}

/** Someone has been charged for a seat that no longer exists. */
export async function alertAdmins(subject: string, body: string): Promise<void> {
  await send(env.adminEmails, subject, body, "alert");
}

/**
 * The confirmation a guest gets after paying. Quiet and factual, like the
 * screens: the facts, the link back, and the one thing they need to know if
 * they can't come.
 *
 * The link carries the details token, so it keeps working without a login and
 * survives a lost tab — and if the seat is transferred it becomes the new
 * guest's link without anything being reissued.
 */
export async function sendGuestConfirmation(
  to: string,
  dinner: Dinner,
  signup: Signup
): Promise<boolean> {
  const link = `${env.siteUrl}/d/${dinner.slug}/confirmed?t=${signup.details_token}`;

  const body = [
    `Confirmed, ${signup.name.split(" ")[0]}.`,
    "",
    `${longDate(dinner.starts_at)} at ${time(dinner.starts_at)}`,
    dinner.full_address ?? "",
    dinner.details_note ?? "",
    "",
    "Your details, any time:",
    link,
    "",
    "Seats are non-refundable. If you can't come, send someone in your place —",
    "text the host their name and number, and this same link becomes theirs.",
  ]
    .filter((line, i, all) => !(line === "" && all[i - 1] === ""))
    .join("\n");

  return send([to], `Confirmed — ${dinner.title}`, body, "confirmation");
}
