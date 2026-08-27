create or replace function public.enqueue_sale_commissions()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  perform public.create_sale_commissions(new.sale_id);
  return new;
end;
$$;
drop trigger if exists sale_items_commission_after_insert on public.sale_items;
create trigger sale_items_commission_after_insert after insert on public.sale_items for each row execute function public.enqueue_sale_commissions();
revoke all on function public.enqueue_sale_commissions() from public,anon,authenticated;