-- Sabha — schema. Run once in the Supabase SQL editor.
-- Two tables. Resist the third.

create extension if not exists pgcrypto;

-- ─────────────────────────────────────────────────────────── dinners

create table if not exists dinners (
  id               uuid primary key default gen_random_uuid(),
  slug             text unique not null,          -- 'october-12'
  title            text not null,
  starts_at        timestamptz not null,
  neighborhood     text,                          -- 'Gramercy' — shown before payment
  full_address     text,                          -- shown only after payment
  price_cents      integer not null,
  seats_total      integer not null,
  access_code      text not null,                 -- 'SABHA-OCT12'
  details_note     text,                          -- buzzer, floor, what to know
  host_phone       text,                          -- the "text the host" button
  status           text not null default 'draft', -- draft | open | closed
  created_at       timestamptz default now(),

  -- Codes are compared case-insensitively and trimmed — people paste from a
  -- text with a trailing space. Normalising in the column keeps the lookup an
  -- exact, indexed match rather than a pattern search.
  access_code_normalized text generated always as (lower(btrim(access_code))) stored
);

create unique index if not exists dinners_access_code_key
  on dinners (access_code_normalized);

-- ─────────────────────────────────────────────────────────── signups

create table if not exists signups (
  id                    uuid primary key default gen_random_uuid(),
  dinner_id             uuid references dinners(id) on delete cascade,
  name                  text not null,
  phone                 text not null,
  dietary_restrictions  text,
  -- Captured from Stripe Checkout's customer_details, not from our own form:
  -- Checkout always collects an email, so asking again would be a second ask
  -- for something we are already given.
  email                 text,
  -- pending | paid | cancelled | refunded | comped | transferred | overbooked
  --   transferred: the seat changed hands. Name and phone are the new guest's;
  --   stripe_payment_intent still points at the original charge, because that
  --   is who actually paid. Occupies a seat exactly like 'paid'.
  --   overbooked: the card was charged but the seat had gone. Rare, and only
  --   possible if a hold expires mid-checkout. Needs a manual refund; the
  --   admin guest list calls it out.
  status                text not null default 'pending',
  stripe_session_id     text unique,
  stripe_payment_intent text,
  amount_paid_cents     integer,
  details_token         text unique default encode(gen_random_bytes(24), 'hex'),
  hold_expires_at       timestamptz,
  created_at            timestamptz default now(),
  paid_at               timestamptz
);

create index if not exists signups_dinner_status_idx on signups (dinner_id, status);

-- one seat per phone number per dinner
create unique index if not exists signups_one_seat_per_phone
  on signups (dinner_id, phone)
  where status in ('paid', 'comped', 'transferred');

-- ─────────────────────────────────────────── seats remaining is a query

-- security_invoker: the view has no RLS of its own and would otherwise run as
-- its owner. Harmless while nobody can select it, but it means any future
-- grant is safe by construction rather than by remembering.
create or replace view dinner_availability
  with (security_invoker = true)
as
select
  d.id,
  d.seats_total,
  d.seats_total - count(s.id) filter (
    where s.status in ('paid','comped','transferred')
       or (s.status = 'pending' and s.hold_expires_at > now())
  ) as seats_remaining
from dinners d
left join signups s on s.dinner_id = d.id
group by d.id;

-- ─────────────────────────────────────────────────── rate limiting

create table if not exists code_attempts (
  id           bigserial primary key,
  ip           text not null,
  kind         text not null default 'code',  -- code | hold
  attempted_at timestamptz not null default now()
);

create index if not exists code_attempts_kind_ip_time_idx
  on code_attempts (kind, ip, attempted_at desc);

-- Nothing reads rows older than the longest window, so they are only ballast.
-- Schedule with pg_cron if it is enabled, or run it by hand now and then.
--   select cron.schedule('prune-code-attempts', '0 4 * * *',
--     $$delete from code_attempts where attempted_at < now() - interval '1 day'$$);

-- ─────────────────────────────────────────────── atomic seat hold
-- Row-locks the dinner so the last two seats cannot be sold three times
-- while three people sit on the Stripe page.

create or replace function hold_seat(
  p_dinner_id    uuid,
  p_name         text,
  p_phone        text,
  p_diet         text,
  p_hold_minutes int default 15
) returns signups
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_dinner dinners;
  v_taken  integer;
  v_row    signups;
begin
  select * into v_dinner from dinners where id = p_dinner_id for update;
  if not found then
    raise exception 'dinner_not_found';
  end if;
  if v_dinner.status <> 'open' then
    raise exception 'signups_closed';
  end if;

  -- Already holding or holding a paid seat on this phone?
  perform 1 from signups s
   where s.dinner_id = p_dinner_id
     and s.phone = p_phone
     and (s.status in ('paid','comped','transferred')
       or (s.status = 'pending' and s.hold_expires_at > now()));
  if found then
    raise exception 'duplicate_phone';
  end if;

  select count(*) into v_taken from signups s
   where s.dinner_id = p_dinner_id
     and (s.status in ('paid','comped','transferred')
       or (s.status = 'pending' and s.hold_expires_at > now()));

  if v_taken >= v_dinner.seats_total then
    raise exception 'sold_out';
  end if;

  insert into signups (dinner_id, name, phone, dietary_restrictions, status, hold_expires_at)
  values (
    p_dinner_id, p_name, p_phone,
    nullif(btrim(coalesce(p_diet, '')), ''),
    'pending',
    now() + make_interval(mins => p_hold_minutes)
  )
  returning * into v_row;

  return v_row;
end;
$$;

-- ────────────────────────────────────────── confirm a payment
-- Called only by the Stripe webhook, which is the source of truth. Idempotent:
-- webhooks retry, and a second delivery must not double-anything.
-- Paid beats pending: someone else's unexpired hold never blocks a real charge.

create or replace function confirm_payment(
  p_session_id      text,
  p_payment_intent  text,
  p_amount_cents    integer
) returns signups
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row    signups;
  v_dinner dinners;
  v_taken  integer;
  v_dupe   boolean;
begin
  select * into v_row from signups where stripe_session_id = p_session_id;
  if not found then
    raise exception 'signup_not_found';
  end if;

  -- Already settled. Nothing to do.
  if v_row.status in ('paid', 'comped', 'transferred', 'refunded', 'overbooked') then
    return v_row;
  end if;

  select * into v_dinner from dinners where id = v_row.dinner_id for update;

  select count(*) into v_taken
    from signups s
   where s.dinner_id = v_row.dinner_id
     and s.id <> v_row.id
     and s.status in ('paid', 'comped', 'transferred');

  select exists (
    select 1 from signups s
     where s.dinner_id = v_row.dinner_id
       and s.id <> v_row.id
       and s.phone = v_row.phone
       and s.status in ('paid', 'comped', 'transferred')
  ) into v_dupe;

  if v_taken >= v_dinner.seats_total or v_dupe then
    update signups
       set status = 'overbooked',
           stripe_payment_intent = p_payment_intent,
           amount_paid_cents = p_amount_cents,
           paid_at = now(),
           hold_expires_at = null
     where id = v_row.id
     returning * into v_row;
    return v_row;
  end if;

  update signups
     set status = 'paid',
         stripe_payment_intent = p_payment_intent,
         amount_paid_cents = p_amount_cents,
         paid_at = now(),
         hold_expires_at = null
   where id = v_row.id
   returning * into v_row;

  return v_row;
end;
$$;

-- ─────────────────────────────────────────────────────────── RLS
-- Enable it and grant the anonymous role nothing. Every read and write goes
-- through a Next.js route handler using the service role key, which lives only
-- in Vercel's environment variables and never reaches the browser.
-- This is the opposite of the usual Supabase advice, and it is right here for
-- one reason: the address and the guest list must not be public.
--
-- ENABLE, then FORCE. Enable alone still exempts the table owner, and the
-- owner is the role the SQL editor runs as — so without FORCE these tables are
-- readable by exactly the session most likely to be sitting open in a browser
-- tab. There are no policies anywhere, deliberately: with none defined, RLS
-- denies everything, and service_role gets through on BYPASSRLS rather than on
-- a policy someone could later widen by accident.

alter table dinners       enable row level security;
alter table signups       enable row level security;
alter table code_attempts enable row level security;

alter table dinners       force row level security;
alter table signups       force row level security;
alter table code_attempts force row level security;

revoke all on dinners       from anon, authenticated;
revoke all on signups       from anon, authenticated;
revoke all on code_attempts from anon, authenticated;
revoke all on dinner_availability from anon, authenticated;
-- Functions are granted EXECUTE to PUBLIC on creation, and anon inherits from
-- PUBLIC. Revoking from anon by name leaves that default grant untouched — so
-- the two lines that used to be here closed nothing on a clean apply, and
-- confirm_payment (which marks a signup paid) was reachable over PostgREST RPC
-- with the anon key that ships in the browser bundle.
--
-- Revoke from PUBLIC first, then grant back to the one role that needs it.
-- Order matters: the grant must follow the revoke.
revoke execute on all functions in schema public from public, anon, authenticated;
grant  execute on all functions in schema public to service_role;

-- And for anything created here later, so the next function isn't born public.
-- Applies to objects created by the role running this file.
alter default privileges in schema public
  revoke execute on functions from public, anon, authenticated;

-- NOTE: the sweep above is deliberately schema-wide. If pgcrypto ever lands in
-- `public` rather than `extensions`, gen_random_bytes() — used by the
-- details_token default — is covered by the service_role grant above, so
-- inserts still work. Worth re-checking if that default ever starts failing.

-- ─────────────────────────────── FORCE and security definer: settled
-- hold_seat and confirm_payment are SECURITY DEFINER, so they execute as the
-- function owner, and FORCE makes the owner subject to RLS. With no policies
-- defined that would be a denial — unless the owner holds BYPASSRLS.
--
-- Checked against this project on 2026-09-10: owner is `postgres`, which has
-- rolbypassrls = true (and rolsuper = false). So FORCE plus SECURITY DEFINER
-- is fine here and hold_seat works. Keep definer.
--
-- If this is ever rebuilt on a project where the owner lacks BYPASSRLS, the
-- fix is one word: drop `security definer` from both. They are only ever
-- called through the service-role client, which has BYPASSRLS of its own.
