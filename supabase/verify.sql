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
--    Settled 2026-09-10: postgres, rolbypassrls = true. Keep security definer.
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

-- 7. EXECUTE on the two functions. THIS IS THE ONE THAT BIT US.
--    Functions are granted EXECUTE to PUBLIC on creation and anon inherits it,
--    so revoking from anon by name leaves the hole wide open. has_function_
--    privilege resolves inheritance, which naming the grantee in
--    information_schema does not.
select p.proname,
       has_function_privilege('anon',          p.oid, 'EXECUTE') as anon_execute,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_execute,
       has_function_privilege('service_role',  p.oid, 'EXECUTE') as service_execute
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in ('hold_seat','confirm_payment')
 order by p.proname;
-- expect: anon_execute = false, auth_execute = false, service_execute = true

-- 8. The view runs as the invoker, not its owner.
select c.relname, c.reloptions
  from pg_class c
 where c.relname = 'dinner_availability'
   and c.relnamespace = 'public'::regnamespace;
-- expect: reloptions contains security_invoker=true
