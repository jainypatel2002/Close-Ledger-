-- Lottery simplified workflow: summary-level online/paid-out/amount-due

alter table public.closing_days
  add column if not exists lottery_total_scratch_revenue numeric(12,2) not null default 0,
  add column if not exists lottery_online_amount numeric(12,2) not null default 0,
  add column if not exists lottery_paid_out_amount numeric(12,2) not null default 0,
  add column if not exists lottery_amount_due numeric(12,2) not null default 0;

-- Ensure legacy environments have compatible scratch columns before aggregation.
alter table public.lottery_scratch_lines
  add column if not exists display_number_snapshot integer,
  add column if not exists ticket_price_snapshot numeric(12,2),
  add column if not exists sales_amount numeric(12,2) not null default 0,
  add column if not exists payouts numeric(12,2) not null default 0;

with ranked as (
  select
    ls.id,
    row_number() over (partition by ls.closing_day_id order by ls.created_at asc, ls.id asc) as seq
  from public.lottery_scratch_lines ls
)
update public.lottery_scratch_lines ls
set
  display_number_snapshot = coalesce(ls.display_number_snapshot, ranked.seq),
  ticket_price_snapshot = coalesce(ls.ticket_price_snapshot, ls.ticket_price, 0),
  sales_amount = case
    when coalesce(ls.sales_amount, 0) = 0 then coalesce(ls.scratch_sales, 0)
    else ls.sales_amount
  end,
  payouts = case
    when coalesce(ls.payouts, 0) = 0 then coalesce(ls.scratch_payouts, 0)
    else ls.payouts
  end
from ranked
where ranked.id = ls.id;

with scratch as (
  select
    cd.id as closing_day_id,
    coalesce(sum(coalesce(ls.sales_amount, ls.scratch_sales, 0)), 0) as scratch_revenue,
    coalesce(sum(coalesce(ls.payouts, ls.scratch_payouts, 0)), 0) as scratch_payouts
  from public.closing_days cd
  left join public.lottery_scratch_lines ls on ls.closing_day_id = cd.id
  group by cd.id
)
update public.closing_days cd
set
  lottery_total_scratch_revenue =
    case
      when coalesce(cd.lottery_total_scratch_revenue, 0) = 0
        then coalesce(scratch.scratch_revenue, 0)
      else cd.lottery_total_scratch_revenue
    end,
  lottery_online_amount =
    case
      when coalesce(cd.lottery_online_amount, 0) = 0
        then coalesce(cd.draw_sales, 0)
      else cd.lottery_online_amount
    end,
  lottery_paid_out_amount =
    case
      when coalesce(cd.lottery_paid_out_amount, 0) = 0
        then coalesce(scratch.scratch_payouts, 0) + coalesce(cd.draw_payouts, 0)
      else cd.lottery_paid_out_amount
    end,
  lottery_amount_due =
    case
      when coalesce(cd.lottery_amount_due, 0) = 0
        then (
          coalesce(
            nullif(cd.lottery_total_scratch_revenue, 0),
            coalesce(scratch.scratch_revenue, 0)
          )
          - coalesce(
            nullif(cd.lottery_paid_out_amount, 0),
            coalesce(scratch.scratch_payouts, 0) + coalesce(cd.draw_payouts, 0)
          )
        ) + coalesce(nullif(cd.lottery_online_amount, 0), coalesce(cd.draw_sales, 0))
      else cd.lottery_amount_due
    end
from scratch
where scratch.closing_day_id = cd.id;

alter table public.closing_days
  drop constraint if exists closing_days_lottery_total_scratch_revenue_check,
  add constraint closing_days_lottery_total_scratch_revenue_check
    check (lottery_total_scratch_revenue >= 0),
  drop constraint if exists closing_days_lottery_online_amount_check,
  add constraint closing_days_lottery_online_amount_check
    check (lottery_online_amount >= 0),
  drop constraint if exists closing_days_lottery_paid_out_amount_check,
  add constraint closing_days_lottery_paid_out_amount_check
    check (lottery_paid_out_amount >= 0);

alter table public.lottery_scratch_lines
  add column if not exists store_id uuid references public.stores(id) on delete cascade,
  add column if not exists lottery_number_snapshot integer,
  add column if not exists amount_snapshot numeric(12,2),
  add column if not exists created_by_app_user_id uuid references auth.users(id) on delete set null,
  add column if not exists updated_by_app_user_id uuid references auth.users(id) on delete set null;

update public.lottery_scratch_lines ls
set
  store_id = coalesce(ls.store_id, cd.store_id),
  lottery_number_snapshot = coalesce(ls.lottery_number_snapshot, ls.display_number_snapshot, 1),
  amount_snapshot = coalesce(ls.amount_snapshot, ls.ticket_price_snapshot, ls.ticket_price, 0)
from public.closing_days cd
where cd.id = ls.closing_day_id;

alter table public.lottery_scratch_lines
  alter column store_id set not null,
  alter column lottery_number_snapshot set not null,
  alter column amount_snapshot set not null;

alter table public.lottery_scratch_lines
  drop constraint if exists lottery_scratch_lines_lottery_number_snapshot_check,
  add constraint lottery_scratch_lines_lottery_number_snapshot_check
    check (lottery_number_snapshot > 0),
  drop constraint if exists lottery_scratch_lines_amount_snapshot_check,
  add constraint lottery_scratch_lines_amount_snapshot_check
    check (amount_snapshot >= 0);

create index if not exists idx_lottery_scratch_lines_store_closing
  on public.lottery_scratch_lines (store_id, closing_day_id);
