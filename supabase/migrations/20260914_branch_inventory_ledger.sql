-- Keep branch_inventory as the operational stock ledger while preserving products.current_stock for legacy read models.
create or replace function public.apply_branch_inventory_movement()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_before numeric(12,2); v_after numeric(12,2);
begin
  insert into public.branch_inventory(organization_id,branch_id,product_id,quantity)
  values(new.organization_id,new.branch_id,new.product_id,0)
  on conflict(branch_id,product_id) do nothing;
  select quantity into v_before from public.branch_inventory where branch_id=new.branch_id and product_id=new.product_id for update;
  v_after := v_before + new.quantity;
  if v_after < 0 then raise exception 'Insufficient branch inventory' using errcode='23514'; end if;
  update public.branch_inventory set quantity=v_after,updated_at=now() where branch_id=new.branch_id and product_id=new.product_id;
  update public.products set current_stock=v_after,current_cost=coalesce(new.unit_cost,current_cost) where id=new.product_id and organization_id=new.organization_id and branch_id=new.branch_id;
  new.stock_before:=v_before;
  new.stock_after:=v_after;
  new.actor_id:=coalesce(new.actor_id,auth.uid());
  return new;
end $$;
drop trigger if exists inventory_movement_updates_branch_inventory on public.inventory_movements;
create trigger inventory_movement_updates_branch_inventory before insert on public.inventory_movements for each row execute function public.apply_branch_inventory_movement();
revoke all on function public.apply_branch_inventory_movement() from public,anon,authenticated;

-- Reconcile only rows missing a branch ledger entry; existing entries retain their movement-derived quantity.
insert into public.branch_inventory(organization_id,branch_id,product_id,quantity)
select product.organization_id,product.branch_id,product.id,product.current_stock from public.products product
on conflict(branch_id,product_id) do nothing;