-- Lottery master archival + active-only uniqueness for setup safety.

alter table public.lottery_master_entries
  add column if not exists is_archived boolean not null default false,
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by_app_user_id uuid references auth.users(id) on delete set null;

update public.lottery_master_entries
set
  is_archived = coalesce(is_archived, false),
  is_active = case when coalesce(is_archived, false) then false else is_active end,
  archived_at = case
    when coalesce(is_archived, false) and archived_at is null then now()
    else archived_at
  end;

alter table public.lottery_master_entries
  drop constraint if exists lottery_master_store_display_unique,
  drop constraint if exists lottery_master_not_archived_active_check,
  add constraint lottery_master_not_archived_active_check
    check (not (is_archived and is_active));

drop index if exists public.idx_lottery_master_store_name_unique;
drop index if exists public.idx_lottery_master_store_active;

create unique index if not exists idx_lottery_master_store_display_active_unique
  on public.lottery_master_entries (store_id, display_number)
  where (is_active = true and is_archived = false);

create unique index if not exists idx_lottery_master_store_name_active_unique
  on public.lottery_master_entries (store_id, lower(name))
  where (is_active = true and is_archived = false);

create index if not exists idx_lottery_master_store_status
  on public.lottery_master_entries (store_id, is_archived, is_active, display_number);

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
  elsif old.is_archived is distinct from new.is_archived then
    v_action_type := case when new.is_archived then 'LOTTERY_MASTER_ARCHIVED' else 'LOTTERY_MASTER_RESTORED' end;
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

drop policy if exists "lottery_master_select" on public.lottery_master_entries;
create policy "lottery_master_select" on public.lottery_master_entries
for select to authenticated
using (
  public.is_store_admin(store_id)
  or (
    public.is_store_member_active(store_id)
    and is_active = true
    and is_archived = false
  )
);
