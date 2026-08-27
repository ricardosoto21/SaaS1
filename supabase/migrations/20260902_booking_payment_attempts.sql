create table if not exists public.booking_payment_attempts (
  id uuid primary key default gen_random_uuid(),
  hold_id uuid not null unique references public.booking_holds(id) on delete cascade,
  provider text not null,
  external_checkout_id text not null unique,
  checkout_url text not null,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
alter table public.booking_payment_attempts enable row level security;
