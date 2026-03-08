-- Vendor payout support for closing persistence + PDF rendering.

create table if not exists public.vendor_payout_lines (
  id uuid primary key default gen_random_uuid(),
  closing_day_id uuid not null,
  vendor_name text not null,
  amount numeric(12,2) not null default 0,
  notes text,
  created_by_app_user_id uuid references auth.users(id) on delete set null,
  updated_by_app_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vendor_payout_lines_amount_check check (amount >= 0)
);

create index if not exists idx_vendor_payout_lines_closing_day
  on public.vendor_payout_lines (closing_day_id);
create index if not exists idx_vendor_payout_lines_closing_vendor
  on public.vendor_payout_lines (closing_day_id, vendor_name);

do $$
begin
  if to_regclass('public.closing_days') is not null then
    if not exists (
      select 1
      from pg_constraint
      where conname = 'vendor_payout_lines_closing_day_id_fkey'
        and conrelid = 'public.vendor_payout_lines'::regclass
    ) then
      alter table public.vendor_payout_lines
        add constraint vendor_payout_lines_closing_day_id_fkey
          foreign key (closing_day_id)
          references public.closing_days(id)
          on delete cascade;
    end if;
  else
    raise notice 'Skipping vendor_payout_lines FK: public.closing_days does not exist yet.';
  end if;
end $$;

do $$
begin
  if to_regprocedure('public.set_updated_at()') is not null then
    drop trigger if exists trg_vendor_payout_lines_updated_at on public.vendor_payout_lines;
    create trigger trg_vendor_payout_lines_updated_at
    before update on public.vendor_payout_lines
    for each row execute function public.set_updated_at();
  else
    raise notice 'Skipping vendor_payout_lines trigger: public.set_updated_at() is missing.';
  end if;
end $$;

alter table public.vendor_payout_lines enable row level security;

drop policy if exists "vendor_payout_select" on public.vendor_payout_lines;
drop policy if exists "vendor_payout_modify" on public.vendor_payout_lines;

do $$
begin
  if to_regprocedure('public.can_view_closing(uuid)') is not null then
    execute $policy$
      create policy "vendor_payout_select" on public.vendor_payout_lines
      for select to authenticated
      using (public.can_view_closing(closing_day_id))
    $policy$;
  else
    raise notice 'Skipping vendor_payout_select policy: public.can_view_closing(uuid) is missing.';
  end if;
end $$;

do $$
begin
  if to_regprocedure('public.can_edit_closing(uuid)') is not null then
    execute $policy$
      create policy "vendor_payout_modify" on public.vendor_payout_lines
      for all to authenticated
      using (public.can_edit_closing(closing_day_id))
      with check (public.can_edit_closing(closing_day_id))
    $policy$;
  else
    raise notice 'Skipping vendor_payout_modify policy: public.can_edit_closing(uuid) is missing.';
  end if;
end $$;
