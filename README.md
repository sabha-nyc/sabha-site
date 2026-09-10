# Sabha

An invite-only dinner series. Guests enter an access code on the homepage, see
the dinner, pay for a seat up front, and only then see the address.

Next.js (App Router) on Vercel · Supabase Postgres · Stripe Checkout.

---

## Getting it running

```bash
cp .env.example .env.local     # fill in the keys
npm install
npm run dev
```

In a second terminal, so payments actually complete:

```bash
npm run stripe:listen          # prints the STRIPE_WEBHOOK_SECRET to paste in
```

Then, once:

1. Paste `supabase/schema.sql` into the Supabase SQL editor and run it.
2. Add your address to `ADMIN_EMAILS`, visit `/admin/login`, and sign in.
3. Create a dinner, set its status to **open**, and try the code on `/`.
4. Pay with `4242 4242 4242 4242`, any future expiry, any CVC.

`SESSION_SECRET` is any 32 bytes of hex — `openssl rand -hex 32`.

## The flow

```
Guest:   sabha.com  →  enters code  →  sees the dinner  →  name/phone/dietary  →  Stripe Checkout  →  sees the address
Server:  resolves code to a dinner  →  holds a seat (15 min)  →  [WEBHOOK confirms payment]  →  issues details token
```

**The webhook is the source of truth, not the redirect.** People close the tab,
lose signal, get a call. `checkout.session.completed` flips a signup to paid;
`/d/[slug]/confirmed` only reads the result, and says so plainly while it waits.

The 15-minute hold stops the last two seats being sold three times while three
people sit on the Stripe page. An expired hold frees itself, because seats
remaining is a query (`dinner_availability`), never a stored counter.

## Routes

| Route | |
|---|---|
| `/` | Code entry. The mark and one field. Without a code there is no site. |
| `/d/[slug]` | Date, time, neighbourhood, price, seats left. Address withheld. |
| `/d/[slug]/signup` | Name, phone, dietary restrictions → hold → Stripe. |
| `/d/[slug]/confirmed?t=…` | The address. Bookmarkable via the token. |
| `/d/[slug]/calendar.ics?t=…` | The same details as an `.ics`, gated on the same token. |
| `/d/[slug]/full` | Sold out. No waitlist by design. |
| `/refunds` | The policy, linked from checkout. |
| `/admin` | Every dinner, seats sold and money collected. |
| `/admin/dinners/new`, `/admin/dinners/[id]` | Create and edit. |
| `/admin/dinners/[id]/guests` | The guest list. |
| `/api/stripe/webhook` | Stripe only. |

## Security posture

- **RLS is on and the anonymous role has nothing.** Every read and write goes
  through a route handler or server action using the service-role key, which
  lives only in the server environment. This is the opposite of the usual
  Supabase advice and it is right here for one reason: the address and the
  guest list must not be public.
- **Access codes are verified server-side only.** A valid code sets a signed,
  `httpOnly` cookie scoped to that dinner's slug, good for one hour. Five
  attempts per IP per ten minutes. A wrong code and a guessed slug get the same
  answer: *That code isn't right.*
- **Admin is a magic link plus a hardcoded allowlist** (`ADMIN_EMAILS`),
  checked in middleware and again in the admin layout. Receiving a link is not
  the same as being allowed in.

This is a velvet rope, not a vault. It stops a forwarded link becoming
strangers at the table, which is the actual threat.

## Money

Hosted Stripe Checkout, one-time payment mode, `SABHA DINNER` on the statement.
Card data never touches this server (PCI SAQ A); Apple Pay and Google Pay come
free, which matters because most signups arrive from a text on a phone.

Two things that only bite once:

- Stripe treats prepaid events as a chargeback-prone category. A new account
  can hit a delayed first payout or a rolling reserve. **The account must exist
  and take one real $1 charge at least two weeks before the first dinner.**
- Refunds issued from the Stripe dashboard flow back through
  `charge.refunded`, so the guest list stays honest either way.

### `overbooked`

A signup can end up `overbooked`: the card was charged but the seat had gone.
It takes a hold expiring mid-checkout, so it is rare, but it is possible and
silently dropping it would be worse. `confirm_payment` marks the row, the
webhook logs it loudly, and the guest list shows **Refund me** against that
guest. Refunding is a manual click, on purpose.

## What is deliberately not here

A waitlist ("sold out, next one soon" is the better message), guest accounts,
automated SMS reminders (the host sends them by hand for the first two dinners,
which is how we find out what they should say), plus-ones as a concept, a photo
archive.

## Still the client's call

1. **Domain**, bought on their account and pointed at Vercel.
2. **Refund policy and cutoff.** `/refunds` currently says full refund to 72
   hours, then transferable. Change the copy there if that isn't it.
3. **Seat price — fixed per dinner, or tiered?** The schema assumes one price
   per dinner. Tiers are easy now and awkward to retrofit.
4. **Does anything use the phone number automatically?** Today it is only so
   the host can text guests. Automatic confirmations mean Twilio, about half a
   day, and a line of disclosure on the signup form.

One non-technical flag, not legal advice: taking payment for a meal reads
differently from splitting costs among friends. Twenty minutes with someone who
knows NYC food-service rules is cheap insurance before this grows past
personally invited guests.

## Before the first real code goes out

Live keys in. Buy a seat with a real card, confirm the descriptor reads
`SABHA DINNER`, refund it, watch the payout land. Only then.
