-- Nightly Closing schema + RBAC + RLS
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.stores (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete set null,
  store_name text not null,
  legal_name text,
  address_line1 text not null,
  address_line2 text,
  city text not null,
  state text not null,
  zip text not null,
  phone text,
  email text,
  header_text text,
  tax_rate_default numeric(8,6) not null default 0.0625,
  timezone text not null default 'America/New_York',
  scratch_bundle_size_default integer not null default 100,
  include_billpay_in_gross boolean not null default true,
  include_lottery_in_gross boolean not null default true,
  allow_staff_view_history boolean not null default false,
  allow_staff_print_pdf boolean not null default false,
  allow_staff_export boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint stores_tax_rate_check check (tax_rate_default >= 0 and tax_rate_default <= 1),
  constraint stores_bundle_size_check check (scratch_bundle_size_default > 0)
);

create table if not exists public.store_members (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('ADMIN', 'STAFF')),
  is_active boolean not null default true,
  permissions jsonb not null default '{}'::jsonb,
  last_active_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, user_id)
);

create table if not exists public.closing_days (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  business_date date not null,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  status text not null default 'DRAFT' check (status in ('DRAFT', 'SUBMITTED', 'FINALIZED', 'LOCKED')),
  locked_at timestamptz,
  locked_by uuid references auth.users(id) on delete set null,
  submitted_at timestamptz,
  finalized_at timestamptz,
  tax_mode text not null default 'AUTO' check (tax_mode in ('AUTO', 'MANUAL')),
  tax_rate_used numeric(8,6) not null default 0.0625,
  tax_amount numeric(12,2) not null default 0,
  tax_amount_manual numeric(12,2),
  tax_override_enabled boolean not null default false,
  total_sales_gross numeric(12,2) not null default 0,
  taxable_sales numeric(12,2) not null default 0,
  non_taxable_sales numeric(12,2) not null default 0,
  draw_sales numeric(12,2) not null default 0,
  draw_payouts numeric(12,2) not null default 0,
  lottery_total_sales numeric(12,2) not null default 0,
  lottery_total_payouts numeric(12,2) not null default 0,
  lottery_net numeric(12,2) not null default 0,
  billpay_collected_total numeric(12,2) not null default 0,
  billpay_fee_revenue numeric(12,2) not null default 0,
  billpay_transactions_count integer not null default 0,
  cash_amount numeric(12,2) not null default 0,
  card_amount numeric(12,2) not null default 0,
  ebt_amount numeric(12,2) not null default 0,
  other_amount numeric(12,2) not null default 0,
  cash_over_short numeric(12,2) not null default 0,
  notes text,
  include_billpay_in_gross boolean not null default true,
  include_lottery_in_gross boolean not null default true,
  gross_collected numeric(12,2) not null default 0,
  true_revenue numeric(12,2) not null default 0,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, business_date)
);

create table if not exists public.closing_category_lines (
  id uuid primary key default gen_random_uuid(),
  closing_day_id uuid not null references public.closing_days(id) on delete cascade,
  category_name text not null,
  amount numeric(12,2) not null default 0,
  taxable boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.lottery_scratch_lines (
  id uuid primary key default gen_random_uuid(),
  closing_day_id uuid not null references public.closing_days(id) on delete cascade,
  game_name text not null,
  pack_id text,
  start_ticket_number integer not null default 0,
  end_ticket_number integer not null default 0,
  inclusive_count boolean not null default false,
  bundle_size integer not null default 100,
  ticket_price numeric(12,2) not null default 0,
  tickets_sold_override integer,
  override_reason text,
  tickets_sold_computed integer not null default 0,
  scratch_sales numeric(12,2) not null default 0,
  scratch_payouts numeric(12,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.billpay_lines (
  id uuid primary key default gen_random_uuid(),
  closing_day_id uuid not null references public.closing_days(id) on delete cascade,
  provider_name text not null,
  amount_collected numeric(12,2) not null default 0,
  fee_revenue numeric(12,2) not null default 0,
  txn_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.closing_documents (
  id uuid primary key default gen_random_uuid(),
  closing_day_id uuid not null references public.closing_days(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  file_name text not null,
  bucket_path text not null,
  public_url text,
  source text not null default 'SERVER' check (source in ('SERVER', 'CLIENT_OFFLINE')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  store_id uuid references public.stores(id) on delete set null,
  closing_day_id uuid references public.closing_days(id) on delete set null,
  table_name text not null,
  row_id uuid,
  action_type text not null,
  actor_id uuid references auth.users(id) on delete set null,
  reason text,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

create index if not exists idx_store_members_store_user on public.store_members(store_id, user_id);
create index if not exists idx_store_members_user on public.store_members(user_id);
create index if not exists idx_closing_days_store_date on public.closing_days(store_id, business_date desc);
create index if not exists idx_closing_days_store_status on public.closing_days(store_id, status);
create index if not exists idx_closing_category_lines_closing on public.closing_category_lines(closing_day_id);
create index if not exists idx_lottery_scratch_lines_closing on public.lottery_scratch_lines(closing_day_id);
create index if not exists idx_billpay_lines_closing on public.billpay_lines(closing_day_id);
create index if not exists idx_closing_documents_closing on public.closing_documents(closing_day_id);
create index if not exists idx_audit_log_store_created on public.audit_log(store_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Utility triggers
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_user_profiles_updated_at on public.user_profiles;
create trigger trg_user_profiles_updated_at before update on public.user_profiles
for each row execute function public.set_updated_at();

drop trigger if exists trg_stores_updated_at on public.stores;
create trigger trg_stores_updated_at before update on public.stores
for each row execute function public.set_updated_at();

drop trigger if exists trg_store_members_updated_at on public.store_members;
create trigger trg_store_members_updated_at before update on public.store_members
for each row execute function public.set_updated_at();

drop trigger if exists trg_closing_days_updated_at on public.closing_days;
create trigger trg_closing_days_updated_at before update on public.closing_days
for each row execute function public.set_updated_at();

drop trigger if exists trg_closing_category_lines_updated_at on public.closing_category_lines;
create trigger trg_closing_category_lines_updated_at before update on public.closing_category_lines
for each row execute function public.set_updated_at();

drop trigger if exists trg_lottery_scratch_lines_updated_at on public.lottery_scratch_lines;
create trigger trg_lottery_scratch_lines_updated_at before update on public.lottery_scratch_lines
for each row execute function public.set_updated_at();

drop trigger if exists trg_billpay_lines_updated_at on public.billpay_lines;
create trigger trg_billpay_lines_updated_at before update on public.billpay_lines
for each row execute function public.set_updated_at();

drop trigger if exists trg_closing_documents_updated_at on public.closing_documents;
create trigger trg_closing_documents_updated_at before update on public.closing_documents
for each row execute function public.set_updated_at();

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_profiles (id, full_name, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''), lower(new.email))
  on conflict (id) do update
  set full_name = excluded.full_name,
      email = excluded.email,
      updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_auth_user();

create or replace function public.apply_member_default_permissions()
returns trigger
language plpgsql
as $$
begin
  if new.role = 'ADMIN' then
    new.permissions = coalesce(new.permissions, '{}'::jsonb) || jsonb_build_object(
      'can_view_history', true,
      'can_print_pdf', true,
      'can_view_reports', true,
      'can_export_data', true,
      'can_create_closing', true,
      'can_view_only_own_entries', false
    );
  else
    new.permissions = coalesce(new.permissions, '{}'::jsonb) || jsonb_build_object(
      'can_view_history', false,
      'can_print_pdf', false,
      'can_view_reports', false,
      'can_export_data', false,
      'can_create_closing', true,
      'can_view_only_own_entries', true
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_apply_member_default_permissions on public.store_members;
create trigger trg_apply_member_default_permissions
before insert or update on public.store_members
for each row execute function public.apply_member_default_permissions();

-- ---------------------------------------------------------------------------
-- Helper functions for RLS checks
-- ---------------------------------------------------------------------------

create or replace function public.is_store_member_active(p_store_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.store_members sm
    where sm.store_id = p_store_id
      and sm.user_id = auth.uid()
      and sm.is_active = true
  );
$$;

create or replace function public.is_store_admin(p_store_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.store_members sm
    where sm.store_id = p_store_id
      and sm.user_id = auth.uid()
      and sm.is_active = true
      and sm.role = 'ADMIN'
  );
$$;

create or replace function public.is_store_staff(p_store_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.store_members sm
    where sm.store_id = p_store_id
      and sm.user_id = auth.uid()
      and sm.is_active = true
      and sm.role = 'STAFF'
  );
$$;

create or replace function public.has_store_permission(p_store_id uuid, p_key text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role text;
  v_permissions jsonb;
  v_allow_history boolean;
  v_allow_print boolean;
  v_allow_export boolean;
begin
  select sm.role, sm.permissions
  into v_role, v_permissions
  from public.store_members sm
  where sm.store_id = p_store_id
    and sm.user_id = auth.uid()
    and sm.is_active = true
  limit 1;

  if v_role is null then
    return false;
  end if;

  if v_role = 'ADMIN' then
    return true;
  end if;

  select s.allow_staff_view_history, s.allow_staff_print_pdf, s.allow_staff_export
  into v_allow_history, v_allow_print, v_allow_export
  from public.stores s
  where s.id = p_store_id;

  if p_key = 'can_view_history' and v_allow_history then
    return true;
  end if;
  if p_key = 'can_print_pdf' and v_allow_print then
    return true;
  end if;
  if p_key = 'can_export_data' and v_allow_export then
    return true;
  end if;

  return coalesce((v_permissions ->> p_key)::boolean, false);
end;
$$;

create or replace function public.can_edit_closing(p_closing_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with target as (
    select cd.id, cd.store_id, cd.created_by, cd.status, cd.business_date
    from public.closing_days cd
    where cd.id = p_closing_id
  )
  select exists (
    select 1 from target t
    where public.is_store_admin(t.store_id)
       or (
         public.is_store_staff(t.store_id)
         and t.created_by = auth.uid()
         and t.status = 'DRAFT'
         and t.business_date = current_date
       )
  );
$$;

create or replace function public.can_view_closing(p_closing_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with target as (
    select cd.id, cd.store_id, cd.created_by, cd.status, cd.business_date
    from public.closing_days cd
    where cd.id = p_closing_id
  )
  select exists (
    select 1
    from target t
    where public.is_store_admin(t.store_id)
      or (
        public.is_store_staff(t.store_id)
        and (
          (
            t.created_by = auth.uid()
            and (t.status = 'DRAFT' or t.business_date = current_date)
          )
          or (
            public.has_store_permission(t.store_id, 'can_view_history')
            and (
              not public.has_store_permission(t.store_id, 'can_view_only_own_entries')
              or t.created_by = auth.uid()
            )
          )
        )
      )
  );
$$;

create or replace function public.profile_visible_to_user(p_profile_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() = p_profile_user_id
  or exists (
    select 1
    from public.store_members me
    join public.store_members them
      on them.store_id = me.store_id
    where me.user_id = auth.uid()
      and me.role = 'ADMIN'
      and me.is_active = true
      and them.user_id = p_profile_user_id
      and them.is_active = true
  );
$$;

-- ---------------------------------------------------------------------------
-- Closing guard trigger (server-side hard lock for staff)
-- ---------------------------------------------------------------------------

create or replace function public.enforce_closing_lock_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if public.is_store_admin(coalesce(new.store_id, old.store_id)) then
    return new;
  end if;

  -- staff protection: cannot alter anything once previous status is not DRAFT
  if tg_op = 'UPDATE' then
    if old.created_by <> auth.uid() then
      raise exception 'Staff can only modify their own closings.';
    end if;
    if old.status <> 'DRAFT' then
      raise exception 'This record is locked or you do not have permission to edit it.';
    end if;
    if new.status = 'LOCKED' then
      raise exception 'Staff cannot set LOCKED status directly.';
    end if;
    if new.status in ('SUBMITTED', 'FINALIZED') then
      new.locked_at = now();
      new.locked_by = auth.uid();
      if new.status = 'SUBMITTED' and new.submitted_at is null then
        new.submitted_at = now();
      end if;
      if new.status = 'FINALIZED' and new.finalized_at is null then
        new.finalized_at = now();
      end if;
    end if;
  end if;

  if tg_op = 'INSERT' then
    if new.created_by is null then
      new.created_by = auth.uid();
    end if;
    if new.updated_by is null then
      new.updated_by = auth.uid();
    end if;
    if new.status = 'LOCKED' then
      raise exception 'Staff cannot insert LOCKED entries.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_closing_lock_rules on public.closing_days;
create trigger trg_enforce_closing_lock_rules
before insert or update on public.closing_days
for each row execute function public.enforce_closing_lock_rules();

-- ---------------------------------------------------------------------------
-- Audit triggers
-- ---------------------------------------------------------------------------

create or replace function public.log_store_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.audit_log (
    store_id, table_name, row_id, action_type, actor_id, before_data, after_data
  )
  values (
    coalesce(new.id, old.id),
    'stores',
    coalesce(new.id, old.id),
    tg_op,
    auth.uid(),
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('UPDATE', 'INSERT') then to_jsonb(new) else null end
  );
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_log_store_audit on public.stores;
create trigger trg_log_store_audit
after insert or update or delete on public.stores
for each row execute function public.log_store_audit();

create or replace function public.log_store_member_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.audit_log (
    store_id, table_name, row_id, action_type, actor_id, before_data, after_data
  )
  values (
    coalesce(new.store_id, old.store_id),
    'store_members',
    coalesce(new.id, old.id),
    tg_op,
    auth.uid(),
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('UPDATE', 'INSERT') then to_jsonb(new) else null end
  );
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_log_store_member_audit on public.store_members;
create trigger trg_log_store_member_audit
after insert or update or delete on public.store_members
for each row execute function public.log_store_member_audit();

create or replace function public.log_closing_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.audit_log (
    store_id, closing_day_id, table_name, row_id, action_type, actor_id, before_data, after_data
  )
  values (
    coalesce(new.store_id, old.store_id),
    coalesce(new.id, old.id),
    'closing_days',
    coalesce(new.id, old.id),
    tg_op,
    auth.uid(),
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('UPDATE', 'INSERT') then to_jsonb(new) else null end
  );
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_log_closing_audit on public.closing_days;
create trigger trg_log_closing_audit
after insert or update or delete on public.closing_days
for each row execute function public.log_closing_audit();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.user_profiles enable row level security;
alter table public.stores enable row level security;
alter table public.store_members enable row level security;
alter table public.closing_days enable row level security;
alter table public.closing_category_lines enable row level security;
alter table public.lottery_scratch_lines enable row level security;
alter table public.billpay_lines enable row level security;
alter table public.closing_documents enable row level security;
alter table public.audit_log enable row level security;

-- user_profiles
drop policy if exists "profiles_select" on public.user_profiles;
create policy "profiles_select" on public.user_profiles
for select to authenticated
using (public.profile_visible_to_user(id));

drop policy if exists "profiles_update_self" on public.user_profiles;
create policy "profiles_update_self" on public.user_profiles
for update to authenticated
using (id = auth.uid())
with check (id = auth.uid());

drop policy if exists "profiles_insert_self" on public.user_profiles;
create policy "profiles_insert_self" on public.user_profiles
for insert to authenticated
with check (id = auth.uid());

-- stores
drop policy if exists "stores_select" on public.stores;
create policy "stores_select" on public.stores
for select to authenticated
using (public.is_store_member_active(id) or owner_id = auth.uid());

drop policy if exists "stores_insert" on public.stores;
create policy "stores_insert" on public.stores
for insert to authenticated
with check (owner_id = auth.uid());

drop policy if exists "stores_update_admin" on public.stores;
create policy "stores_update_admin" on public.stores
for update to authenticated
using (public.is_store_admin(id) or owner_id = auth.uid())
with check (public.is_store_admin(id) or owner_id = auth.uid());

drop policy if exists "stores_delete_admin" on public.stores;
create policy "stores_delete_admin" on public.stores
for delete to authenticated
using (public.is_store_admin(id) or owner_id = auth.uid());

-- store_members
drop policy if exists "store_members_select" on public.store_members;
create policy "store_members_select" on public.store_members
for select to authenticated
using (
  user_id = auth.uid()
  or public.is_store_admin(store_id)
);

drop policy if exists "store_members_insert_admin" on public.store_members;
create policy "store_members_insert_admin" on public.store_members
for insert to authenticated
with check (public.is_store_admin(store_id) or exists (
  select 1 from public.stores s where s.id = store_id and s.owner_id = auth.uid()
));

drop policy if exists "store_members_update_admin" on public.store_members;
create policy "store_members_update_admin" on public.store_members
for update to authenticated
using (public.is_store_admin(store_id))
with check (public.is_store_admin(store_id));

drop policy if exists "store_members_delete_admin" on public.store_members;
create policy "store_members_delete_admin" on public.store_members
for delete to authenticated
using (public.is_store_admin(store_id));

-- closing_days
drop policy if exists "closing_days_select" on public.closing_days;
create policy "closing_days_select" on public.closing_days
for select to authenticated
using (public.can_view_closing(id));

drop policy if exists "closing_days_insert" on public.closing_days;
create policy "closing_days_insert" on public.closing_days
for insert to authenticated
with check (
  public.is_store_admin(store_id)
  or (
    public.is_store_staff(store_id)
    and created_by = auth.uid()
    and status = 'DRAFT'
    and business_date = current_date
    and public.has_store_permission(store_id, 'can_create_closing')
  )
);

drop policy if exists "closing_days_update" on public.closing_days;
create policy "closing_days_update" on public.closing_days
for update to authenticated
using (
  public.is_store_admin(store_id)
  or public.can_edit_closing(id)
)
with check (
  public.is_store_admin(store_id)
  or (
    public.is_store_staff(store_id)
    and created_by = auth.uid()
    and status in ('DRAFT', 'SUBMITTED', 'FINALIZED')
  )
);

drop policy if exists "closing_days_delete_admin" on public.closing_days;
create policy "closing_days_delete_admin" on public.closing_days
for delete to authenticated
using (public.is_store_admin(store_id));

-- closing_category_lines
drop policy if exists "category_select" on public.closing_category_lines;
create policy "category_select" on public.closing_category_lines
for select to authenticated
using (public.can_view_closing(closing_day_id));

drop policy if exists "category_modify" on public.closing_category_lines;
create policy "category_modify" on public.closing_category_lines
for all to authenticated
using (public.can_edit_closing(closing_day_id))
with check (public.can_edit_closing(closing_day_id));

-- lottery_scratch_lines
drop policy if exists "lottery_select" on public.lottery_scratch_lines;
create policy "lottery_select" on public.lottery_scratch_lines
for select to authenticated
using (public.can_view_closing(closing_day_id));

drop policy if exists "lottery_modify" on public.lottery_scratch_lines;
create policy "lottery_modify" on public.lottery_scratch_lines
for all to authenticated
using (public.can_edit_closing(closing_day_id))
with check (public.can_edit_closing(closing_day_id));

-- billpay_lines
drop policy if exists "billpay_select" on public.billpay_lines;
create policy "billpay_select" on public.billpay_lines
for select to authenticated
using (public.can_view_closing(closing_day_id));

drop policy if exists "billpay_modify" on public.billpay_lines;
create policy "billpay_modify" on public.billpay_lines
for all to authenticated
using (public.can_edit_closing(closing_day_id))
with check (public.can_edit_closing(closing_day_id));

-- closing_documents
drop policy if exists "documents_select" on public.closing_documents;
create policy "documents_select" on public.closing_documents
for select to authenticated
using (
  public.is_store_admin(store_id)
  or (
    public.can_view_closing(closing_day_id)
    and (
      public.has_store_permission(store_id, 'can_print_pdf')
      or created_by = auth.uid()
    )
  )
);

drop policy if exists "documents_insert" on public.closing_documents;
create policy "documents_insert" on public.closing_documents
for insert to authenticated
with check (
  public.is_store_admin(store_id)
  or (
    public.can_view_closing(closing_day_id)
    and created_by = auth.uid()
    and public.has_store_permission(store_id, 'can_print_pdf')
  )
);

drop policy if exists "documents_update_admin" on public.closing_documents;
create policy "documents_update_admin" on public.closing_documents
for update to authenticated
using (public.is_store_admin(store_id))
with check (public.is_store_admin(store_id));

drop policy if exists "documents_delete_admin" on public.closing_documents;
create policy "documents_delete_admin" on public.closing_documents
for delete to authenticated
using (public.is_store_admin(store_id));

-- audit_log
drop policy if exists "audit_select_admin" on public.audit_log;
create policy "audit_select_admin" on public.audit_log
for select to authenticated
using (
  store_id is null
  or public.is_store_admin(store_id)
);

drop policy if exists "audit_insert_actor" on public.audit_log;
create policy "audit_insert_actor" on public.audit_log
for insert to authenticated
with check (
  actor_id = auth.uid()
  and (
    store_id is null
    or public.is_store_member_active(store_id)
    or exists (
      select 1 from public.stores s
      where s.id = store_id and s.owner_id = auth.uid()
    )
  )
);

-- ---------------------------------------------------------------------------
-- Storage bucket + RLS
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('closing-pdfs', 'closing-pdfs', false)
on conflict (id) do nothing;

drop policy if exists "closing_pdfs_select" on storage.objects;
create policy "closing_pdfs_select" on storage.objects
for select to authenticated
using (
  bucket_id = 'closing-pdfs'
  and exists (
    select 1
    from public.closing_documents cd
    where cd.bucket_path = storage.objects.name
      and (
        public.is_store_admin(cd.store_id)
        or (
          public.can_view_closing(cd.closing_day_id)
          and (cd.created_by = auth.uid() or public.has_store_permission(cd.store_id, 'can_print_pdf'))
        )
      )
  )
);

drop policy if exists "closing_pdfs_insert" on storage.objects;
create policy "closing_pdfs_insert" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'closing-pdfs'
  and split_part(name, '/', 1) = auth.uid()::text
);

drop policy if exists "closing_pdfs_delete_admin" on storage.objects;
create policy "closing_pdfs_delete_admin" on storage.objects
for delete to authenticated
using (
  bucket_id = 'closing-pdfs'
  and exists (
    select 1
    from public.closing_documents cd
    where cd.bucket_path = storage.objects.name
      and public.is_store_admin(cd.store_id)
  )
);
