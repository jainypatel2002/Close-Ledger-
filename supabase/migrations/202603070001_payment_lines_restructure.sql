-- Payments and tax restructure: dynamic payment lines with backward-compatible summaries

create table if not exists public.payment_lines (
  id uuid primary key default gen_random_uuid(),
  closing_day_id uuid not null references public.closing_days(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  payment_type text not null,
  label text not null,
  amount numeric(12,2) not null default 0,
  sort_order integer not null default 0,
  created_by_app_user_id uuid references auth.users(id) on delete set null,
  updated_by_app_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payment_lines_payment_type_check check (payment_type in ('cash', 'card', 'ebt', 'other')),
  constraint payment_lines_amount_check check (amount >= 0)
);

alter table public.closing_days
  add column if not exists payments_total numeric(12,2) not null default 0;

update public.closing_days
set payments_total = coalesce(cash_amount, 0) + coalesce(card_amount, 0) + coalesce(ebt_amount, 0) + coalesce(other_amount, 0)
where coalesce(payments_total, 0) = 0;

alter table public.closing_days
  drop constraint if exists closing_days_payments_total_check,
  add constraint closing_days_payments_total_check check (payments_total >= 0);

insert into public.payment_lines (
  id,
  closing_day_id,
  store_id,
  payment_type,
  label,
  amount,
  sort_order,
  created_by_app_user_id,
  updated_by_app_user_id,
  created_at,
  updated_at
)
select
  gen_random_uuid(),
  cd.id,
  cd.store_id,
  seed.payment_type,
  seed.label,
  seed.amount,
  seed.sort_order,
  cd.created_by,
  cd.updated_by,
  coalesce(cd.created_at, now()),
  coalesce(cd.updated_at, now())
from public.closing_days cd
cross join lateral (
  values
    ('cash'::text, 'Cash'::text, coalesce(cd.cash_amount, 0)::numeric, 0),
    ('card'::text, 'Card'::text, coalesce(cd.card_amount, 0)::numeric, 1),
    ('ebt'::text, 'EBT'::text, coalesce(cd.ebt_amount, 0)::numeric, 2),
    ('other'::text, 'Other'::text, coalesce(cd.other_amount, 0)::numeric, 3)
) as seed(payment_type, label, amount, sort_order)
where seed.amount > 0
  and not exists (
    select 1
    from public.payment_lines pl
    where pl.closing_day_id = cd.id
      and pl.payment_type = seed.payment_type
      and lower(pl.label) = lower(seed.label)
  );

create index if not exists idx_payment_lines_closing_type
  on public.payment_lines (closing_day_id, payment_type, sort_order);
create index if not exists idx_payment_lines_store_type
  on public.payment_lines (store_id, payment_type);
create index if not exists idx_closing_days_store_business_date
  on public.closing_days (store_id, business_date);
create index if not exists idx_lottery_scratch_lines_closing_game_name
  on public.lottery_scratch_lines (closing_day_id, game_name);
create index if not exists idx_billpay_lines_closing_day_id
  on public.billpay_lines (closing_day_id);

drop trigger if exists trg_payment_lines_updated_at on public.payment_lines;
create trigger trg_payment_lines_updated_at
before update on public.payment_lines
for each row execute function public.set_updated_at();

alter table public.payment_lines enable row level security;

drop policy if exists "payment_select" on public.payment_lines;
create policy "payment_select" on public.payment_lines
for select to authenticated
using (public.can_view_closing(closing_day_id));

drop policy if exists "payment_modify" on public.payment_lines;
create policy "payment_modify" on public.payment_lines
for all to authenticated
using (public.can_edit_closing(closing_day_id))
with check (public.can_edit_closing(closing_day_id));
