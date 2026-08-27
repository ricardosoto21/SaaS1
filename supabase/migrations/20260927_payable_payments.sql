create table if not exists public.payable_payments (
  id text primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  purchase_id text references public.purchases(id) on delete cascade,
  expense_id text references public.expenses(id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0),
  method public.payment_method not null,
  paid_at timestamptz not null,
  note text not null default '',
  created_at timestamptz not null default now(),
  check ((purchase_id is not null)::int + (expense_id is not null)::int = 1)
);

create index if not exists payable_payments_tenant_target_idx
  on public.payable_payments (organization_id, branch_id, purchase_id, expense_id, paid_at desc);

alter table public.payable_payments enable row level security;

create policy payable_payments_tenant_read on public.payable_payments
  for select to authenticated
  using (organization_id = public.current_organization_id() and public.has_branch_access(branch_id));

create policy payable_payments_tenant_write on public.payable_payments
  for all to authenticated
  using (organization_id = public.current_organization_id() and public.has_branch_access(branch_id) and public.is_admin())
  with check (organization_id = public.current_organization_id() and public.has_branch_access(branch_id) and public.is_admin());

create or replace function public.tenant_record_purchase_payable_payment(
  p_purchase_id text,
  p_payment_id text,
  p_amount numeric,
  p_method public.payment_method,
  p_paid_at timestamptz,
  p_note text,
  p_organization_id uuid,
  p_branch_id uuid
)
returns void language plpgsql security definer set search_path = public as $$
declare v_due numeric;
begin
  perform public.assert_tenant_access(p_organization_id, p_branch_id);
  if not public.is_admin() then raise exception 'Access denied' using errcode = '42501'; end if;
  select amount_due into v_due from public.purchases
    where id = p_purchase_id and organization_id = p_organization_id and branch_id = p_branch_id for update;
  if not found then raise exception 'Purchase not found' using errcode = 'P0002'; end if;
  if p_amount <= 0 or p_amount > v_due then raise exception 'Invalid payment amount' using errcode = 'P0002'; end if;
  insert into public.payable_payments(id, organization_id, branch_id, purchase_id, amount, method, paid_at, note)
    values (p_payment_id, p_organization_id, p_branch_id, p_purchase_id, p_amount, p_method, p_paid_at, coalesce(p_note, ''));
  update public.purchases set amount_paid = amount_paid + p_amount, amount_due = amount_due - p_amount
    where id = p_purchase_id and organization_id = p_organization_id and branch_id = p_branch_id;
end $$;

create or replace function public.tenant_record_expense_payable_payment(
  p_expense_id text,
  p_payment_id text,
  p_amount numeric,
  p_method public.payment_method,
  p_paid_at timestamptz,
  p_note text,
  p_organization_id uuid,
  p_branch_id uuid
)
returns void language plpgsql security definer set search_path = public as $$
declare v_amount numeric; v_status text;
begin
  perform public.assert_tenant_access(p_organization_id, p_branch_id);
  if not public.is_admin() then raise exception 'Access denied' using errcode = '42501'; end if;
  select amount, payment_status into v_amount, v_status from public.expenses
    where id = p_expense_id and organization_id = p_organization_id and branch_id = p_branch_id for update;
  if not found then raise exception 'Expense not found' using errcode = 'P0002'; end if;
  if v_status <> 'pending' or p_amount <> v_amount then raise exception 'Expense must be paid in full' using errcode = 'P0002'; end if;
  insert into public.payable_payments(id, organization_id, branch_id, expense_id, amount, method, paid_at, note)
    values (p_payment_id, p_organization_id, p_branch_id, p_expense_id, p_amount, p_method, p_paid_at, coalesce(p_note, ''));
  update public.expenses set payment_status = 'paid', payment_method = p_method, paid_at = p_paid_at
    where id = p_expense_id and organization_id = p_organization_id and branch_id = p_branch_id;
end $$;

grant select, insert on public.payable_payments to authenticated;
grant execute on function public.tenant_record_purchase_payable_payment(text,text,numeric,public.payment_method,timestamptz,text,uuid,uuid) to authenticated;
grant execute on function public.tenant_record_expense_payable_payment(text,text,numeric,public.payment_method,timestamptz,text,uuid,uuid) to authenticated;
