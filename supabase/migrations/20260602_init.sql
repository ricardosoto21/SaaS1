create extension if not exists "pgcrypto";

create type public.app_role as enum ('admin', 'recepcion', 'estilista');
create type public.appointment_status as enum ('scheduled', 'confirmed', 'completed', 'cancelled', 'no_show');
create type public.payment_status as enum ('unpaid', 'partial', 'paid');
create type public.inventory_movement_type as enum ('purchase', 'sale', 'adjustment');
create type public.sale_origin as enum ('appointment', 'manual');
create type public.sale_item_type as enum ('service', 'product');
create type public.payment_method as enum ('cash', 'transfer', 'card', 'mercado_pago', 'other');

create table if not exists public.settings (
  id text primary key default 'default' check (id = 'default'),
  salon_name text not null default 'Peluqueria',
  business_name text not null default 'Peluqueria',
  currency text not null default 'CLP',
  locale text not null default 'es-CL',
  timezone text not null default 'America/Santiago',
  low_stock_threshold integer not null default 4,
  created_at timestamptz not null default now()
);

create table if not exists public.professionals (
  id text primary key,
  full_name text not null,
  specialty text not null default '',
  color text not null default '#0f766e',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null,
  email text not null,
  role public.app_role not null default 'recepcion',
  professional_id text references public.professionals (id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.clients (
  id text primary key,
  full_name text not null,
  phone text not null,
  email text,
  birthday date,
  preferences text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.service_categories (
  id text primary key,
  name text not null unique
);

create table if not exists public.product_categories (
  id text primary key,
  name text not null unique
);

create table if not exists public.expense_categories (
  id text primary key,
  name text not null unique
);

create table if not exists public.services (
  id text primary key,
  name text not null,
  category_id text not null references public.service_categories (id),
  duration_minutes integer not null,
  base_price numeric(12, 2) not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.products (
  id text primary key,
  name text not null,
  category_id text not null references public.product_categories (id),
  sku text not null unique,
  current_cost numeric(12, 2) not null,
  sale_price numeric(12, 2) not null,
  current_stock numeric(12, 2) not null default 0 check (current_stock >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.appointments (
  id text primary key,
  client_id text not null references public.clients (id),
  professional_id text not null references public.professionals (id),
  start_at timestamptz not null,
  status public.appointment_status not null default 'scheduled',
  notes text not null default '',
  estimated_total numeric(12, 2) not null default 0,
  total_duration_minutes integer not null default 0,
  sale_id text,
  created_at timestamptz not null default now()
);

create table if not exists public.appointment_services (
  id text primary key,
  appointment_id text not null references public.appointments (id) on delete cascade,
  service_id text not null references public.services (id),
  price numeric(12, 2) not null,
  duration_minutes integer not null,
  notes text not null default ''
);

create table if not exists public.sales (
  id text primary key,
  client_id text not null references public.clients (id),
  professional_id text not null references public.professionals (id),
  appointment_id text references public.appointments (id) on delete set null,
  origin public.sale_origin not null,
  sold_at timestamptz not null,
  notes text not null default '',
  total numeric(12, 2) not null default 0,
  amount_paid numeric(12, 2) not null default 0,
  amount_due numeric(12, 2) not null default 0,
  payment_status public.payment_status not null default 'unpaid',
  created_at timestamptz not null default now()
);

alter table public.appointments
  add constraint appointments_sale_fk
  foreign key (sale_id) references public.sales (id) on delete set null;

create table if not exists public.sale_items (
  id text primary key,
  sale_id text not null references public.sales (id) on delete cascade,
  item_type public.sale_item_type not null,
  service_id text references public.services (id) on delete set null,
  product_id text references public.products (id) on delete set null,
  item_name text not null,
  category_name text not null,
  quantity numeric(12, 2) not null default 1,
  unit_price numeric(12, 2) not null,
  total numeric(12, 2) not null
);

create table if not exists public.payments (
  id text primary key,
  sale_id text not null references public.sales (id) on delete cascade,
  amount numeric(12, 2) not null check (amount > 0),
  method public.payment_method not null,
  paid_at timestamptz not null,
  note text not null default ''
);

create table if not exists public.purchases (
  id text primary key,
  purchased_at timestamptz not null,
  supplier text not null,
  category_name text not null,
  notes text not null default '',
  total numeric(12, 2) not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.purchase_items (
  id text primary key,
  purchase_id text not null references public.purchases (id) on delete cascade,
  product_id text not null references public.products (id),
  quantity numeric(12, 2) not null,
  unit_cost numeric(12, 2) not null,
  total numeric(12, 2) not null
);

create table if not exists public.expenses (
  id text primary key,
  spent_at timestamptz not null,
  category_id text not null references public.expense_categories (id),
  description text not null,
  amount numeric(12, 2) not null,
  created_at timestamptz not null default now()
);

create table if not exists public.inventory_movements (
  id text primary key,
  product_id text not null references public.products (id),
  movement_type public.inventory_movement_type not null,
  quantity numeric(12, 2) not null,
  unit_cost numeric(12, 2),
  note text not null default '',
  happened_at timestamptz not null,
  reference_id text
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users (id) on delete set null,
  actor_email text,
  action text not null,
  entity_type text not null,
  entity_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists appointments_start_at_idx on public.appointments (start_at);
create index if not exists appointments_professional_start_idx on public.appointments (professional_id, start_at);
create index if not exists sales_sold_at_idx on public.sales (sold_at);
create index if not exists payments_paid_at_idx on public.payments (paid_at);
create index if not exists expenses_spent_at_idx on public.expenses (spent_at);
create index if not exists purchases_purchased_at_idx on public.purchases (purchased_at);
create index if not exists inventory_movements_happened_at_idx on public.inventory_movements (happened_at);

create or replace function public.current_app_role()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid() and active = true
$$;

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_app_role() is not null
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_app_role() = 'admin'
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email, role, active)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    new.email,
    'recepcion',
    false
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.log_audit(
  action text,
  entity_type text,
  entity_id text default null,
  details jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.audit_logs (actor_id, actor_email, action, entity_type, entity_id, details)
  values (auth.uid(), auth.jwt()->>'email', action, entity_type, entity_id, coalesce(details, '{}'::jsonb));
end;
$$;

alter table public.settings enable row level security;
alter table public.profiles enable row level security;
alter table public.professionals enable row level security;
alter table public.clients enable row level security;
alter table public.service_categories enable row level security;
alter table public.product_categories enable row level security;
alter table public.expense_categories enable row level security;
alter table public.services enable row level security;
alter table public.products enable row level security;
alter table public.appointments enable row level security;
alter table public.appointment_services enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
alter table public.payments enable row level security;
alter table public.purchases enable row level security;
alter table public.purchase_items enable row level security;
alter table public.expenses enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.audit_logs enable row level security;

create policy "staff can read settings" on public.settings for select to authenticated using (public.is_staff());
create policy "admins can manage settings" on public.settings for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "profiles can read own or admin" on public.profiles for select to authenticated using (id = auth.uid() or public.is_admin());
create policy "admins can manage profiles" on public.profiles for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "staff can read professionals" on public.professionals for select to authenticated using (public.is_staff());
create policy "admins can manage professionals" on public.professionals for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "staff can read business data" on public.clients for select to authenticated using (public.is_staff());
create policy "staff can write clients" on public.clients for all to authenticated using (public.current_app_role() in ('admin', 'recepcion', 'estilista')) with check (public.current_app_role() in ('admin', 'recepcion', 'estilista'));

create policy "staff can read service categories" on public.service_categories for select to authenticated using (public.is_staff());
create policy "admins can manage service categories" on public.service_categories for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "staff can read product categories" on public.product_categories for select to authenticated using (public.is_staff());
create policy "admins can manage product categories" on public.product_categories for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "staff can read expense categories" on public.expense_categories for select to authenticated using (public.is_staff());
create policy "admin recepcion can manage expense categories" on public.expense_categories for all to authenticated using (public.current_app_role() in ('admin', 'recepcion')) with check (public.current_app_role() in ('admin', 'recepcion'));

create policy "staff can read services" on public.services for select to authenticated using (public.is_staff());
create policy "admins can manage services" on public.services for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "staff can read products" on public.products for select to authenticated using (public.is_staff());
create policy "admin recepcion can manage products" on public.products for all to authenticated using (public.current_app_role() in ('admin', 'recepcion')) with check (public.current_app_role() in ('admin', 'recepcion'));

create policy "staff can read appointments" on public.appointments for select to authenticated using (
  public.current_app_role() in ('admin', 'recepcion')
  or professional_id = (select professional_id from public.profiles where id = auth.uid())
);
create policy "staff can manage appointments" on public.appointments for all to authenticated using (
  public.current_app_role() in ('admin', 'recepcion')
  or professional_id = (select professional_id from public.profiles where id = auth.uid())
) with check (
  public.current_app_role() in ('admin', 'recepcion')
  or professional_id = (select professional_id from public.profiles where id = auth.uid())
);

create policy "staff can read appointment services" on public.appointment_services for select to authenticated using (public.is_staff());
create policy "staff can manage appointment services" on public.appointment_services for all to authenticated using (public.is_staff()) with check (public.is_staff());

create policy "admin recepcion can read sales" on public.sales for select to authenticated using (public.current_app_role() in ('admin', 'recepcion'));
create policy "admin recepcion can manage sales" on public.sales for all to authenticated using (public.current_app_role() in ('admin', 'recepcion')) with check (public.current_app_role() in ('admin', 'recepcion'));

create policy "admin recepcion can read sale items" on public.sale_items for select to authenticated using (public.current_app_role() in ('admin', 'recepcion'));
create policy "admin recepcion can manage sale items" on public.sale_items for all to authenticated using (public.current_app_role() in ('admin', 'recepcion')) with check (public.current_app_role() in ('admin', 'recepcion'));

create policy "admin recepcion can read payments" on public.payments for select to authenticated using (public.current_app_role() in ('admin', 'recepcion'));
create policy "admin recepcion can manage payments" on public.payments for all to authenticated using (public.current_app_role() in ('admin', 'recepcion')) with check (public.current_app_role() in ('admin', 'recepcion'));

create policy "admin recepcion can manage purchases" on public.purchases for all to authenticated using (public.current_app_role() in ('admin', 'recepcion')) with check (public.current_app_role() in ('admin', 'recepcion'));
create policy "admin recepcion can manage purchase items" on public.purchase_items for all to authenticated using (public.current_app_role() in ('admin', 'recepcion')) with check (public.current_app_role() in ('admin', 'recepcion'));

create policy "admin recepcion can manage expenses" on public.expenses for all to authenticated using (public.current_app_role() in ('admin', 'recepcion')) with check (public.current_app_role() in ('admin', 'recepcion'));
create policy "admin recepcion can manage inventory movements" on public.inventory_movements for all to authenticated using (public.current_app_role() in ('admin', 'recepcion')) with check (public.current_app_role() in ('admin', 'recepcion'));

create policy "admins can read audit logs" on public.audit_logs for select to authenticated using (public.is_admin());


revoke execute on function public.log_audit(text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.log_audit(text, text, text, jsonb) to service_role;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

revoke execute on function public.current_app_role() from public, anon;
revoke execute on function public.is_staff() from public, anon;
revoke execute on function public.is_admin() from public, anon;

grant execute on function public.current_app_role() to authenticated, service_role;
grant execute on function public.is_staff() to authenticated, service_role;
grant execute on function public.is_admin() to authenticated, service_role;
