-- Sabha — post-apply verification. Run in the Supabase SQL editor after
-- schema.sql. Every row of every result should read as described.

-- 1. Both tables and the view exist.
select table_name, table_type
  from information_schema.tables
 where table_schema = 'public'
   and table_name in ('dinners','signups','code_attempts','dinner_availability')
 order by table_name;
-- expect: code_attempts BASE TABLE, dinner_availability VIEW,
--         dinners BASE TABLE, signups BASE TABLE

-- 2. RLS enabled AND forced on every table.
select relname, relrowsecurity as enabled, relforcerowsecurity as forced
  from pg_class
 where relname in ('dinners','signups','code_attempts')
   and relnamespace = 'public'::regnamespace
 order by relname;
-- expect: enabled = true AND forced = true on all three

-- 3. No policies at all — with RLS on, none means deny.
select count(*) as policy_count
  from pg_policies where schemaname = 'public';
-- expect: 0

-- 4. Both functions, their security mode and their pinned search_path.
select p.proname,
       case when p.prosecdef then 'definer' else 'invoker' end as security,
       p.proconfig
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in ('hold_seat','confirm_payment')
 order by p.proname;
-- expect: proconfig = {search_path=public,\ pg_temp} on both

-- 5. Does the function owner bypass RLS? This is the FORCE interaction.
select p.proname, r.rolname as owner, r.rolbypassrls
  from pg_proc p
  join pg_roles r on r.oid = p.proowner
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in ('hold_seat','confirm_payment');
-- If rolbypassrls = false, drop `security definer` from both functions.

-- 6. anon and authenticated hold no privileges on anything.
select table_name, grantee, privilege_type
  from information_schema.role_table_grants
 where table_schema = 'public'
   and grantee in ('anon','authenticated')
 order by table_name, grantee;
-- expect: zero rows
