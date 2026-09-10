const TZ = "America/New_York";

export function money(cents: number): string {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  });
}

export function moneyExact(cents: number): string {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export function longDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    timeZone: TZ,
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

export function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    timeZone: TZ,
    day: "numeric",
    month: "short",
  });
}

export function time(iso: string): string {
  return new Date(iso)
    .toLocaleTimeString("en-US", {
      timeZone: TZ,
      hour: "numeric",
      minute: "2-digit",
    })
    .replace("AM", "am")
    .replace("PM", "pm");
}

/** "Three seats left" reads better than "3 seats left" on a quiet page. */
const WORDS = ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"];

export function seatsLeft(n: number): string {
  const word = n >= 0 && n < WORDS.length ? WORDS[n] : String(n);
  return `${word} seat${n === 1 ? "" : "s"} left`;
}

/**
 * The one place a phone number becomes storable. Every write to signups.phone
 * goes through this — the unique index on (dinner_id, phone) is only as good
 * as the normalisation behind it, so "(917) 555-0148", "917-555-0148" and
 * "+1 917 555 0148" have to land on the same string.
 *
 * Returns E.164 (+1XXXXXXXXXX) for anything recognisably North American, or
 * null when it can't be sure — callers reject rather than store a guess.
 */
export function toE164(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const digits = trimmed.replace(/\D/g, "");

  // Any other country code, typed deliberately with a +, is out of scope here
  // rather than silently mangled into a US number.
  if (trimmed.startsWith("+") && !digits.startsWith("1")) return null;

  const national = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  if (national.length !== 10) return null;

  // NANP: area code and exchange both start 2-9.
  if (!/^[2-9]\d{2}[2-9]\d{6}$/.test(national)) return null;

  return `+1${national}`;
}

/** The inverse, for screens. Tolerates anything toE164 would have accepted. */
export function displayPhone(stored: string): string {
  const digits = stored.replace(/\D/g, "");
  const national = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  if (national.length !== 10) return stored;
  return `(${national.slice(0, 3)}) ${national.slice(3, 6)}-${national.slice(6)}`;
}
