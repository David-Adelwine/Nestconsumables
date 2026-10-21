-- Quarterly non-inventory expense planning.
-- This is separate from app_items and stock movements. It stores planned budgets
-- and expense requests such as fuel, travel, contractors, and insurance.

create table if not exists public.app_expense_cycles (
  cycle_id uuid primary key default gen_random_uuid(),
  country text not null,
  fiscal_year integer not null check (fiscal_year between 2020 and 2100),
  quarter smallint not null check (quarter between 1 and 4),
  currency_code text not null,
  status text not null default 'draft'
    check (status in ('draft', 'open', 'in_review', 'approved', 'closed')),
  owner_user_id uuid references auth.users(id) on delete set null,
  source_cycle_id uuid references public.app_expense_cycles(cycle_id) on delete set null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (country, fiscal_year, quarter)
);

create table if not exists public.app_expense_budgets (
  budget_id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references public.app_expense_cycles(cycle_id) on delete cascade,
  nest_id bigint references public.company_nests(nest_id) on delete set null,
  department text not null default '',
  gl_code text not null,
  category text not null,
  budget_amount numeric(14, 2) not null default 0 check (budget_amount >= 0),
  notes text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists app_expense_budgets_cycle_idx
  on public.app_expense_budgets (cycle_id, gl_code, category);

create table if not exists public.app_expense_requests (
  expense_id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references public.app_expense_cycles(cycle_id) on delete cascade,
  nest_id bigint references public.company_nests(nest_id) on delete set null,
  department text not null default '',
  gl_code text not null,
  category text not null,
  expense_type text not null default 'recurring'
    check (expense_type in ('recurring', 'one_off', 'nte_budget')),
  description text not null,
  unit_measure text,
  quantity numeric(14, 3) check (quantity is null or quantity >= 0),
  requested_amount numeric(14, 2) not null check (requested_amount >= 0),
  approved_amount numeric(14, 2) check (approved_amount is null or approved_amount >= 0),
  vendor_name text,
  status text not null default 'draft'
    check (status in ('draft', 'submitted', 'in_review', 'approved', 'rejected')),
  requester_note text,
  review_note text,
  created_by uuid not null references auth.users(id),
  reviewed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists app_expense_requests_cycle_idx
  on public.app_expense_requests (cycle_id, status, category);

create index if not exists app_expense_requests_nest_idx
  on public.app_expense_requests (nest_id, cycle_id);

create or replace function public.app_can_manage_expense_country(p_country text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select
    exists (
      select 1
      from public.app_user_roles r
      where r.user_id = auth.uid()
        and r.role = 'it_admin'
    )
    or exists (
      select 1
      from public.app_user_roles r
      join public.app_user_country_access ca on ca.user_id = r.user_id
      where r.user_id = auth.uid()
        and r.role in ('business_ops_manager', 'procurement', 'finance')
        and lower(ca.country) = lower(p_country)
    );
$$;

revoke all on function public.app_can_manage_expense_country(text) from public;
grant execute on function public.app_can_manage_expense_country(text) to authenticated;

alter table public.app_expense_cycles enable row level security;
alter table public.app_expense_budgets enable row level security;
alter table public.app_expense_requests enable row level security;

grant select, insert, update, delete on public.app_expense_cycles to authenticated;
grant select, insert, update, delete on public.app_expense_budgets to authenticated;
grant select, insert, update, delete on public.app_expense_requests to authenticated;

drop policy if exists app_expense_cycles_country_access on public.app_expense_cycles;
create policy app_expense_cycles_country_access
  on public.app_expense_cycles
  for all
  to authenticated
  using (public.app_can_manage_expense_country(country))
  with check (public.app_can_manage_expense_country(country));

drop policy if exists app_expense_budgets_country_access on public.app_expense_budgets;
create policy app_expense_budgets_country_access
  on public.app_expense_budgets
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.app_expense_cycles c
      where c.cycle_id = app_expense_budgets.cycle_id
        and public.app_can_manage_expense_country(c.country)
    )
  )
  with check (
    exists (
      select 1
      from public.app_expense_cycles c
      where c.cycle_id = app_expense_budgets.cycle_id
        and public.app_can_manage_expense_country(c.country)
    )
  );

drop policy if exists app_expense_requests_country_access on public.app_expense_requests;
create policy app_expense_requests_country_access
  on public.app_expense_requests
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.app_expense_cycles c
      where c.cycle_id = app_expense_requests.cycle_id
        and public.app_can_manage_expense_country(c.country)
    )
  )
  with check (
    exists (
      select 1
      from public.app_expense_cycles c
      where c.cycle_id = app_expense_requests.cycle_id
        and public.app_can_manage_expense_country(c.country)
    )
  );
