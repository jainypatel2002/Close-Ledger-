-- Lottery master catalog + snapshot-safe closing lines + monthly report metadata

create table if not exists public.lottery_master_entries (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  display_number integer not null,
  name text not null,
  ticket_price numeric(12,2) not null,
  default_bundle_size integer not null default 100,
  is_active boolean not null default true,
  is_locked boolean not null default false,
  notes text,
  created_by_app_user_id uuid references auth.users(id) on delete set null,
  updated_by_app_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lottery_master_ticket_price_check check (ticket_price >= 0),
  constraint lottery_master_bundle_size_check check (default_bundle_size > 0),
  constraint lottery_master_display_number_check check (display_number > 0),
  constraint lottery_master_store_display_unique unique (store_id, display_number)
);

create unique index if not exists idx_lottery_master_store_name_unique
  on public.lottery_master_entries (store_id, lower(name));
create index if not exists idx_lottery_master_store_active
  on public.lottery_master_entries (store_id, is_active, display_number);

-- Keep legacy columns but add immutable snapshot columns for historical safety.
alter table public.lottery_scratch_lines
  add column if not exists lottery_master_entry_id uuid references public.lottery_master_entries(id) on delete set null,
  add column if not exists display_number_snapshot integer,
  add column if not exists lottery_name_snapshot text,
  add column if not exists ticket_price_snapshot numeric(12,2),
  add column if not exists bundle_size_snapshot integer,
  add column if not exists is_locked_snapshot boolean not null default false,
  add column if not exists start_number integer,
  add column if not exists end_number integer,
  add column if not exists tickets_sold integer not null default 0,
  add column if not exists sales_amount numeric(12,2) not null default 0,
  add column if not exists payouts numeric(12,2) not null default 0,
  add column if not exists net_amount numeric(12,2) not null default 0,
  add column if not exists manual_override_reason text;

with ranked as (
  select
    id,
    row_number() over (partition by closing_day_id order by created_at asc, id asc) as seq
  from public.lottery_scratch_lines
)
update public.lottery_scratch_lines l
set
  display_number_snapshot = coalesce(l.display_number_snapshot, ranked.seq),
  lottery_name_snapshot = coalesce(nullif(l.lottery_name_snapshot, ''), nullif(l.game_name, ''), 'Lottery'),
  ticket_price_snapshot = coalesce(l.ticket_price_snapshot, l.ticket_price, 0),
  bundle_size_snapshot = coalesce(l.bundle_size_snapshot, l.bundle_size, 100),
  start_number = coalesce(l.start_number, l.start_ticket_number, 0),
  end_number = coalesce(l.end_number, l.end_ticket_number, 0),
  tickets_sold = coalesce(
    l.tickets_sold,
    l.tickets_sold_computed,
    greatest(
      0,
      coalesce(l.end_ticket_number, 0) - coalesce(l.start_ticket_number, 0)
      + case when coalesce(l.inclusive_count, false) then 1 else 0 end
    )
  ),
  sales_amount = coalesce(l.sales_amount, l.scratch_sales, 0),
  payouts = coalesce(l.payouts, l.scratch_payouts, 0),
  net_amount = coalesce(
    l.net_amount,
    coalesce(l.sales_amount, l.scratch_sales, 0) - coalesce(l.payouts, l.scratch_payouts, 0)
  ),
  manual_override_reason = coalesce(l.manual_override_reason, l.override_reason)
from ranked
where ranked.id = l.id;

alter table public.lottery_scratch_lines
  alter column display_number_snapshot set not null,
  alter column lottery_name_snapshot set not null,
  alter column ticket_price_snapshot set not null,
  alter column bundle_size_snapshot set not null,
  alter column start_number set not null,
  alter column end_number set not null;

alter table public.lottery_scratch_lines
  drop constraint if exists lottery_scratch_lines_ticket_price_snapshot_check,
  add constraint lottery_scratch_lines_ticket_price_snapshot_check check (ticket_price_snapshot >= 0),
  drop constraint if exists lottery_scratch_lines_bundle_size_snapshot_check,
  add constraint lottery_scratch_lines_bundle_size_snapshot_check check (bundle_size_snapshot > 0),
  drop constraint if exists lottery_scratch_lines_tickets_sold_check,
  add constraint lottery_scratch_lines_tickets_sold_check check (tickets_sold >= 0),
  drop constraint if exists lottery_scratch_lines_sales_amount_check,
  add constraint lottery_scratch_lines_sales_amount_check check (sales_amount >= 0),
  drop constraint if exists lottery_scratch_lines_payouts_check,
  add constraint lottery_scratch_lines_payouts_check check (payouts >= 0);

create index if not exists idx_lottery_scratch_lines_closing_snapshot
  on public.lottery_scratch_lines (closing_day_id, display_number_snapshot, lottery_name_snapshot);
create index if not exists idx_lottery_scratch_lines_master_closing
  on public.lottery_scratch_lines (lottery_master_entry_id, closing_day_id);
create index if not exists idx_lottery_scratch_lines_game_snapshot
  on public.lottery_scratch_lines (lottery_name_snapshot);

alter table public.closing_documents
  alter column closing_day_id drop not null;

alter table public.closing_documents
  add column if not exists document_type text not null default 'closing_pdf',
  add column if not exists report_year integer,
  add column if not exists report_month integer;

alter table public.closing_documents
  drop constraint if exists closing_documents_document_type_check,
  add constraint closing_documents_document_type_check
    check (document_type in ('closing_pdf', 'monthly_report_pdf'));

create index if not exists idx_closing_documents_store_monthly
  on public.closing_documents (store_id, document_type, report_year, report_month, created_at desc);

create index if not exists idx_closing_days_store_date_monthly
  on public.closing_days (store_id, business_date);

create index if not exists idx_billpay_lines_closing_provider
  on public.billpay_lines (closing_day_id, provider_name);

-- Views (server-side aggregation can read these while still respecting RLS)
create or replace view public.monthly_closing_summary_view as
select
  cd.store_id,
  date_trunc('month', cd.business_date::timestamp)::date as month_start,
  sum(cd.gross_collected) as total_gross_collected_month,
  sum(cd.true_revenue) as total_true_revenue_month,
  sum(cd.taxable_sales) as total_taxable_sales_month,
  sum(cd.non_taxable_sales) as total_non_taxable_sales_month,
  sum(cd.tax_amount) as total_tax_collected_month,
  sum(cd.cash_amount) as total_cash_month,
  sum(cd.card_amount) as total_card_month,
  sum(cd.ebt_amount) as total_ebt_month,
  sum(cd.other_amount) as total_other_payments_month,
  sum(cd.lottery_total_sales) as total_lottery_sales_month,
  sum(cd.lottery_total_payouts) as total_lottery_payouts_month,
  sum(cd.billpay_collected_total) as total_billpay_collected_month,
  sum(cd.billpay_fee_revenue) as total_billpay_fee_revenue_month,
  count(*) as total_closings_count_month
from public.closing_days cd
group by cd.store_id, date_trunc('month', cd.business_date::timestamp)::date;

create or replace view public.monthly_lottery_summary_view as
select
  cd.store_id,
  date_trunc('month', cd.business_date::timestamp)::date as month_start,
  coalesce(ls.lottery_master_entry_id::text, concat('snapshot:', ls.display_number_snapshot::text, ':', ls.lottery_name_snapshot)) as lottery_group_key,
  ls.lottery_master_entry_id,
  ls.display_number_snapshot,
  ls.lottery_name_snapshot,
  sum(ls.tickets_sold) as total_tickets_sold,
  sum(ls.sales_amount) as total_sales_amount,
  sum(ls.payouts) as total_payouts,
  sum(ls.net_amount) as total_net_amount,
  count(*) as line_count
from public.lottery_scratch_lines ls
join public.closing_days cd on cd.id = ls.closing_day_id
group by
  cd.store_id,
  date_trunc('month', cd.business_date::timestamp)::date,
  lottery_group_key,
  ls.lottery_master_entry_id,
  ls.display_number_snapshot,
  ls.lottery_name_snapshot;

create or replace view public.monthly_billpay_summary_view as
select
  cd.store_id,
  date_trunc('month', cd.business_date::timestamp)::date as month_start,
  coalesce(bp.provider_name, 'Unspecified') as provider_name,
  sum(bp.amount_collected) as total_collected,
  sum(bp.fee_revenue) as total_fee_revenue,
  sum(bp.txn_count) as transaction_count
from public.billpay_lines bp
join public.closing_days cd on cd.id = bp.closing_day_id
group by
  cd.store_id,
  date_trunc('month', cd.business_date::timestamp)::date,
  coalesce(bp.provider_name, 'Unspecified');

-- Triggers + audit for lottery master changes
drop trigger if exists trg_lottery_master_entries_updated_at on public.lottery_master_entries;
create trigger trg_lottery_master_entries_updated_at
before update on public.lottery_master_entries
for each row execute function public.set_updated_at();

create or replace function public.log_lottery_master_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_action_type text;
  v_store_id uuid;
  v_row_id uuid;
begin
  v_store_id := coalesce(new.store_id, old.store_id);
  v_row_id := coalesce(new.id, old.id);

  if tg_op = 'INSERT' then
    v_action_type := 'LOTTERY_MASTER_CREATED';
  elsif tg_op = 'DELETE' then
    v_action_type := 'LOTTERY_MASTER_DELETED';
  elsif old.is_locked is distinct from new.is_locked then
    v_action_type := case when new.is_locked then 'LOTTERY_MASTER_LOCKED' else 'LOTTERY_MASTER_UNLOCKED' end;
  elsif old.is_active is distinct from new.is_active then
    v_action_type := case when new.is_active then 'LOTTERY_MASTER_ACTIVATED' else 'LOTTERY_MASTER_DEACTIVATED' end;
  elsif old.display_number is distinct from new.display_number then
    v_action_type := 'LOTTERY_MASTER_DISPLAY_CHANGED';
  elsif old.ticket_price is distinct from new.ticket_price then
    v_action_type := 'LOTTERY_MASTER_PRICE_CHANGED';
  elsif old.name is distinct from new.name then
    v_action_type := 'LOTTERY_MASTER_NAME_CHANGED';
  else
    v_action_type := 'LOTTERY_MASTER_UPDATED';
  end if;

  insert into public.audit_log (
    store_id,
    table_name,
    row_id,
    action_type,
    actor_id,
    before_data,
    after_data
  )
  values (
    v_store_id,
    'lottery_master_entries',
    v_row_id,
    v_action_type,
    auth.uid(),
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('UPDATE', 'INSERT') then to_jsonb(new) else null end
  );

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_log_lottery_master_audit on public.lottery_master_entries;
create trigger trg_log_lottery_master_audit
after insert or update or delete on public.lottery_master_entries
for each row execute function public.log_lottery_master_audit();

alter table public.lottery_master_entries enable row level security;

drop policy if exists "lottery_master_select" on public.lottery_master_entries;
create policy "lottery_master_select" on public.lottery_master_entries
for select to authenticated
using (
  public.is_store_admin(store_id)
  or (
    public.is_store_member_active(store_id)
    and is_active = true
  )
);

drop policy if exists "lottery_master_insert_admin" on public.lottery_master_entries;
create policy "lottery_master_insert_admin" on public.lottery_master_entries
for insert to authenticated
with check (public.is_store_admin(store_id));

drop policy if exists "lottery_master_update_admin" on public.lottery_master_entries;
create policy "lottery_master_update_admin" on public.lottery_master_entries
for update to authenticated
using (public.is_store_admin(store_id))
with check (public.is_store_admin(store_id));

drop policy if exists "lottery_master_delete_admin" on public.lottery_master_entries;
create policy "lottery_master_delete_admin" on public.lottery_master_entries
for delete to authenticated
using (public.is_store_admin(store_id));
