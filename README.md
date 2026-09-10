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
  `httpOnly` cookie scoped to that dinner's slug, good for one hour. A wrong
  code and a guessed slug get the same answer: *That code isn't right.* Every
  `/d/[slug]` route checks the cookie **before** it looks anything up, so a
  real slug and an invented one are indistinguishable — same redirect, same
  body, and no database query in either case to time.
- **Two rate limits, one table.** Five code attempts per IP per ten minutes,
  and five seat holds per IP per half hour — otherwise one person can sit on
  every seat, fifteen minutes at a time, without ever paying.
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

Checkout sessions expire after 30 minutes (Stripe's floor). It can't match the
15-minute hold exactly, but the default is 24 hours, which would let a checkout
complete a day after its hold died.

### `overbooked`

A signup can end up `overbooked`: the card was charged but the seat had gone.
It takes a hold expiring mid-checkout, so it is rare, but it is possible and
silently dropping it would be worse. `confirm_payment` marks the row, the
webhook emails everyone on `ADMIN_EMAILS`, and a banner sits at the top of
every admin page until the row is dealt with. The guest list shows **Refund
me** against that guest. Refunding is a manual click, on purpose.

### Transfers

Seats are non-refundable and transferable. **Transfer** on the guest list edits
the name and phone in place: the row keeps its id, its `details_token` and its
`stripe_payment_intent`, because the person who paid is still the person who
paid, and the link already sitting in the original guest's text keeps working.
The status becomes `transferred`, which occupies a seat exactly like `paid` —
the view, the unique index, `hold_seat` and `confirm_payment` all agree on
`('paid','comped','transferred')`. A comped seat handed on stays `comped`, so
it never lands in the collected column.

Without a transfer path a guest who can't come has no remedy at all, and a
guest with no remedy files a chargeback.

### Phone numbers

`toE164()` in `src/lib/format.ts` is the only thing that may produce a value
for `signups.phone`. Both write paths — guest checkout and admin add-a-guest —
and the transfer edit go through it. It returns `+1XXXXXXXXXX` or `null`, and
callers reject on `null` rather than store a guess. The unique index on
`(dinner_id, phone)` is worth exactly as much as that normalisation.

## What is deliberately not here

A waitlist ("sold out, next one soon" is the better message), guest accounts,
automated SMS reminders (the host sends them by hand for the first two dinners,
which is how we find out what they should say), plus-ones as a concept, a photo
archive.

## Still the client's call

1. **Domain**, bought on their account and pointed at Vercel.
2. **Refund policy.** Now written as **non-refundable, always transferable** —
   on `/refunds`, on the signup page, in the Stripe Checkout line item, and on
   the confirmation. This reverses the 72-hour proposal in the original
   handoff, so it wants an explicit yes before the first code goes out.
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
