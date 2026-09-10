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
  -- pending | paid | cancelled | refunded | comped | overbooked
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
  where status in ('paid', 'comped');

-- ─────────────────────────────────────────── seats remaining is a query

create or replace view dinner_availability as
select
  d.id,
  d.seats_total,
  d.seats_total - count(s.id) filter (
    where s.status in ('paid','comped')
       or (s.status = 'pending' and s.hold_expires_at > now())
  ) as seats_remaining
from dinners d
left join signups s on s.dinner_id = d.id
group by d.id;

-- ─────────────────────────────────────────────────── rate limiting

create table if not exists code_attempts (
  id          bigserial primary key,
  ip          text not null,
  attempted_at timestamptz not null default now()
);

create index if not exists code_attempts_ip_time_idx on code_attempts (ip, attempted_at desc);

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
set search_path = public
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
     and (s.status in ('paid','comped')
       or (s.status = 'pending' and s.hold_expires_at > now()));
  if found then
    raise exception 'duplicate_phone';
  end if;

  select count(*) into v_taken from signups s
   where s.dinner_id = p_dinner_id
     and (s.status in ('paid','comped')
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
set search_path = public
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
  if v_row.status in ('paid', 'comped', 'refunded', 'overbooked') then
    return v_row;
  end if;

  select * into v_dinner from dinners where id = v_row.dinner_id for update;

  select count(*) into v_taken
    from signups s
   where s.dinner_id = v_row.dinner_id
     and s.id <> v_row.id
     and s.status in ('paid', 'comped');

  select exists (
    select 1 from signups s
     where s.dinner_id = v_row.dinner_id
       and s.id <> v_row.id
       and s.phone = v_row.phone
       and s.status in ('paid', 'comped')
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

alter table dinners       enable row level security;
alter table signups       enable row level security;
alter table code_attempts enable row level security;

revoke all on dinners       from anon, authenticated;
revoke all on signups       from anon, authenticated;
revoke all on code_attempts from anon, authenticated;
revoke all on dinner_availability from anon, authenticated;
revoke execute on function hold_seat(uuid, text, text, text, int) from anon, authenticated;
revoke execute on function confirm_payment(text, text, integer) from anon, authenticated;
