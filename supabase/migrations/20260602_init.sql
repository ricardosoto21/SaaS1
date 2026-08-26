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

create or replace function public.replace_app_store(payload jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(hashtext('pelu_app_store'));

  insert into public.settings (
    id, salon_name, business_name, currency, locale, timezone, low_stock_threshold
  )
  values (
    'default',
    coalesce(payload #>> '{settings,salonName}', 'Peluqueria'),
    coalesce(payload #>> '{settings,businessName}', 'Peluqueria'),
    coalesce(payload #>> '{settings,currency}', 'CLP'),
    coalesce(payload #>> '{settings,locale}', 'es-CL'),
    coalesce(payload #>> '{settings,timezone}', 'America/Santiago'),
    coalesce((payload #>> '{settings,lowStockThreshold}')::integer, 4)
  )
  on conflict (id) do update set
    salon_name = excluded.salon_name,
    business_name = excluded.business_name,
    currency = excluded.currency,
    locale = excluded.locale,
    timezone = excluded.timezone,
    low_stock_threshold = excluded.low_stock_threshold;

  delete from public.inventory_movements;
  delete from public.payments;
  delete from public.sale_items;
  update public.appointments set sale_id = null;
  delete from public.sales;
  delete from public.purchase_items;
  delete from public.purchases;
  delete from public.appointment_services;
  delete from public.appointments;
  delete from public.expenses;
  delete from public.services;
  delete from public.products;
  delete from public.clients;
  delete from public.service_categories;
  delete from public.product_categories;
  delete from public.expense_categories;

  insert into public.professionals (id, full_name, specialty, color, active)
  select id, name, coalesce(specialty, ''), coalesce(color, '#0f766e'), coalesce(active, true)
  from jsonb_to_recordset(coalesce(payload->'professionals', '[]'::jsonb))
    as x(id text, name text, specialty text, color text, active boolean)
  where id is not null and name is not null
  on conflict (id) do update set
    full_name = excluded.full_name,
    specialty = excluded.specialty,
    color = excluded.color,
    active = excluded.active;

  insert into public.service_categories (id, name)
  select id, name
  from jsonb_to_recordset(coalesce(payload->'serviceCategories', '[]'::jsonb))
    as x(id text, name text)
  where id is not null and name is not null;

  insert into public.product_categories (id, name)
  select id, name
  from jsonb_to_recordset(coalesce(payload->'productCategories', '[]'::jsonb))
    as x(id text, name text)
  where id is not null and name is not null;

  insert into public.expense_categories (id, name)
  select id, name
  from jsonb_to_recordset(coalesce(payload->'expenseCategories', '[]'::jsonb))
    as x(id text, name text)
  where id is not null and name is not null;

  insert into public.clients (id, full_name, phone, email, birthday, preferences, notes, created_at)
  select id, name, phone, nullif(email, ''), nullif(birthday, '')::date, coalesce(preferences, ''), coalesce(notes, ''), created_at::timestamptz
  from jsonb_to_recordset(coalesce(payload->'clients', '[]'::jsonb))
    as x(id text, name text, phone text, email text, birthday text, preferences text, notes text, "createdAt" text)
  cross join lateral (select coalesce(x."createdAt", now()::text) as created_at) c
  where id is not null and name is not null and phone is not null;

  insert into public.services (id, name, category_id, duration_minutes, base_price, active)
  select id, name, "categoryId", "durationMinutes", "basePrice", coalesce(active, true)
  from jsonb_to_recordset(coalesce(payload->'services', '[]'::jsonb))
    as x(id text, name text, "categoryId" text, "durationMinutes" integer, "basePrice" numeric, active boolean)
  where id is not null and name is not null and "categoryId" is not null;

  insert into public.products (id, name, category_id, sku, current_cost, sale_price, current_stock, active)
  select id, name, "categoryId", sku, cost, "salePrice", "currentStock", coalesce(active, true)
  from jsonb_to_recordset(coalesce(payload->'products', '[]'::jsonb))
    as x(id text, name text, "categoryId" text, sku text, cost numeric, "salePrice" numeric, "currentStock" numeric, active boolean)
  where id is not null and name is not null and "categoryId" is not null;

  insert into public.appointments (
    id, client_id, professional_id, start_at, status, notes, estimated_total, total_duration_minutes, created_at
  )
  select id, "clientId", "professionalId", "startAt"::timestamptz, status::public.appointment_status, coalesce(notes, ''), "estimatedTotal", "totalDurationMinutes", "createdAt"::timestamptz
  from jsonb_to_recordset(coalesce(payload->'appointments', '[]'::jsonb))
    as x(id text, "clientId" text, "professionalId" text, "startAt" text, status text, notes text, "estimatedTotal" numeric, "totalDurationMinutes" integer, "createdAt" text)
  where id is not null and "clientId" is not null and "professionalId" is not null;

  insert into public.appointment_services (id, appointment_id, service_id, price, duration_minutes, notes)
  select line.id, appointment.id, line."serviceId", line.price, line."durationMinutes", coalesce(line.notes, '')
  from jsonb_to_recordset(coalesce(payload->'appointments', '[]'::jsonb))
    as appointment(id text, services jsonb)
  cross join jsonb_to_recordset(coalesce(appointment.services, '[]'::jsonb))
    as line(id text, "serviceId" text, price numeric, "durationMinutes" integer, notes text)
  where line.id is not null and appointment.id is not null and line."serviceId" is not null;

  insert into public.sales (
    id, client_id, professional_id, appointment_id, origin, sold_at, notes, total, amount_paid, amount_due, payment_status
  )
  select id, "clientId", "professionalId", nullif("appointmentId", ''), origin::public.sale_origin, "soldAt"::timestamptz, coalesce(notes, ''), total, "amountPaid", "amountDue", "paymentStatus"::public.payment_status
  from jsonb_to_recordset(coalesce(payload->'sales', '[]'::jsonb))
    as x(id text, "clientId" text, "professionalId" text, "appointmentId" text, origin text, "soldAt" text, notes text, total numeric, "amountPaid" numeric, "amountDue" numeric, "paymentStatus" text)
  where id is not null and "clientId" is not null and "professionalId" is not null;

  insert into public.sale_items (
    id, sale_id, item_type, service_id, product_id, item_name, category_name, quantity, unit_price, total
  )
  select line.id, sale.id, line.type::public.sale_item_type,
    case when line.type = 'service' then nullif(line."referenceId", '') else null end,
    case when line.type = 'product' then nullif(line."referenceId", '') else null end,
    line.name, line."categoryName", line.quantity, line."unitPrice", line.total
  from jsonb_to_recordset(coalesce(payload->'sales', '[]'::jsonb))
    as sale(id text, items jsonb)
  cross join jsonb_to_recordset(coalesce(sale.items, '[]'::jsonb))
    as line(id text, type text, "referenceId" text, name text, "categoryName" text, quantity numeric, "unitPrice" numeric, total numeric)
  where line.id is not null and sale.id is not null;

  update public.appointments appointment
  set sale_id = sale.id
  from jsonb_to_recordset(coalesce(payload->'appointments', '[]'::jsonb))
    as x(id text, "saleId" text)
  join public.sales sale on sale.id = x."saleId"
  where appointment.id = x.id;

  insert into public.payments (id, sale_id, amount, method, paid_at, note)
  select id, "saleId", amount, method::public.payment_method, "paidAt"::timestamptz, coalesce(note, '')
  from jsonb_to_recordset(coalesce(payload->'payments', '[]'::jsonb))
    as x(id text, "saleId" text, amount numeric, method text, "paidAt" text, note text)
  where id is not null and "saleId" is not null and amount > 0;

  insert into public.purchases (id, purchased_at, supplier, category_name, notes, total)
  select id, "purchasedAt"::timestamptz, supplier, "categoryName", coalesce(notes, ''), total
  from jsonb_to_recordset(coalesce(payload->'purchases', '[]'::jsonb))
    as x(id text, "purchasedAt" text, supplier text, "categoryName" text, notes text, total numeric)
  where id is not null and supplier is not null;

  insert into public.purchase_items (id, purchase_id, product_id, quantity, unit_cost, total)
  select line.id, purchase.id, line."productId", line.quantity, line."unitCost", line.total
  from jsonb_to_recordset(coalesce(payload->'purchases', '[]'::jsonb))
    as purchase(id text, items jsonb)
  cross join jsonb_to_recordset(coalesce(purchase.items, '[]'::jsonb))
    as line(id text, "productId" text, quantity numeric, "unitCost" numeric, total numeric)
  where line.id is not null and purchase.id is not null and line."productId" is not null;

  insert into public.expenses (id, spent_at, category_id, description, amount)
  select id, "spentAt"::timestamptz, "categoryId", description, amount
  from jsonb_to_recordset(coalesce(payload->'expenses', '[]'::jsonb))
    as x(id text, "spentAt" text, "categoryId" text, description text, amount numeric)
  where id is not null and "categoryId" is not null and amount >= 0;

  insert into public.inventory_movements (
    id, product_id, movement_type, quantity, unit_cost, note, happened_at, reference_id
  )
  select id, "productId", type::public.inventory_movement_type, quantity, "unitCost", coalesce(note, ''), "happenedAt"::timestamptz, nullif("referenceId", '')
  from jsonb_to_recordset(coalesce(payload->'inventoryMovements', '[]'::jsonb))
    as x(id text, "productId" text, type text, quantity numeric, "unitCost" numeric, note text, "happenedAt" text, "referenceId" text)
  where id is not null and "productId" is not null;
end;
$$;

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

revoke execute on function public.replace_app_store(jsonb) from public, anon, authenticated;
grant execute on function public.replace_app_store(jsonb) to service_role;

revoke execute on function public.log_audit(text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.log_audit(text, text, text, jsonb) to service_role;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

revoke execute on function public.current_app_role() from public, anon;
revoke execute on function public.is_staff() from public, anon;
revoke execute on function public.is_admin() from public, anon;

grant execute on function public.current_app_role() to authenticated, service_role;
grant execute on function public.is_staff() to authenticated, service_role;
grant execute on function public.is_admin() to authenticated, service_role;
