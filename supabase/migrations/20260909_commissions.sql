alter table public.settings add column if not exists commissions_enabled boolean not null default false;
create type public.commission_kind as enum ('service_percent','product_percent','fixed');
create table if not exists public.commission_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  professional_id text not null references public.professionals(id) on delete cascade,
  kind public.commission_kind not null,
  rate numeric(12,4) not null check(rate>=0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists public.commission_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  professional_id text not null references public.professionals(id),
  sale_id text not null references public.sales(id) on delete cascade,
  sale_item_id text not null references public.sale_items(id) on delete cascade,
  amount numeric(12,2) not null check(amount>=0),
  rule_snapshot jsonb not null,
  created_at timestamptz not null default now(),
  unique(sale_item_id)
);
alter table public.commission_rules enable row level security;
alter table public.commission_entries enable row level security;
create policy commission_rules_tenant on public.commission_rules for all to authenticated using(organization_id=public.current_organization_id() and public.is_admin()) with check(organization_id=public.current_organization_id() and public.is_admin());
create policy commission_entries_tenant on public.commission_entries for select to authenticated using(organization_id=public.current_organization_id() and public.has_branch_access(branch_id));
grant select,insert,update,delete on public.commission_rules,public.commission_entries to authenticated;

create or replace function public.create_sale_commissions(p_sale_id text)
returns void language plpgsql security definer set search_path=public as $$
declare sale_row public.sales%rowtype; item_row record; rule_row public.commission_rules%rowtype; v_amount numeric(12,2);
begin
 select * into sale_row from public.sales where id=p_sale_id for update;
 if not found or not exists(select 1 from public.settings where organization_id=sale_row.organization_id and commissions_enabled) then return; end if;
 for item_row in select * from public.sale_items where sale_id=p_sale_id loop
   select * into rule_row from public.commission_rules where organization_id=sale_row.organization_id and professional_id=sale_row.professional_id and active and ((kind='service_percent' and item_row.item_type='service') or (kind='product_percent' and item_row.item_type='product') or kind='fixed') order by created_at desc limit 1;
   if found then
     v_amount := case when rule_row.kind='fixed' then rule_row.rate else round(item_row.total*rule_row.rate/100,2) end;
     insert into public.commission_entries(organization_id,branch_id,professional_id,sale_id,sale_item_id,amount,rule_snapshot) values(sale_row.organization_id,sale_row.branch_id,sale_row.professional_id,p_sale_id,item_row.id,v_amount,jsonb_build_object('id',rule_row.id,'kind',rule_row.kind,'rate',rule_row.rate)) on conflict(sale_item_id) do nothing;
   end if;
 end loop;
end $$;
revoke all on function public.create_sale_commissions(text) from public,anon,authenticated;