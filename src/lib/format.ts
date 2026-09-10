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

/** Digits only, so the same person can't take two seats by typing dashes. */
export function normalizePhone(input: string): string {
  const digits = input.replace(/\D/g, "");
  return digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
}

export function displayPhone(digits: string): string {
  if (digits.length !== 10) return digits;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}
