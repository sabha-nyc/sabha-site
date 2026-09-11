-- Guest confirmation emails. Run once against the existing database.
--
-- The address comes from Stripe Checkout's customer_details rather than our
-- own signup form: Checkout always collects an email, so asking for it twice
-- would be a worse form for no extra information.
--
-- Nullable on purpose. Rows created before this column existed have no email,
-- and comped guests added by hand never will.

alter table signups add column if not exists email text;
