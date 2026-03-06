-- Optional seed script.
-- Run while authenticated in Supabase SQL editor as a test user context,
-- or replace `auth.uid()` with a concrete UUID from auth.users.

with new_store as (
  insert into public.stores (
    owner_id,
    store_name,
    legal_name,
    address_line1,
    city,
    state,
    zip,
    tax_rate_default
  )
  values (
    auth.uid(),
    'Sample Midtown',
    'Sample Midtown LLC',
    '101 Main St',
    'Albany',
    'NY',
    '12207',
    0.0625
  )
  returning id
)
insert into public.store_members (store_id, user_id, role, is_active)
select id, auth.uid(), 'ADMIN', true
from new_store;
