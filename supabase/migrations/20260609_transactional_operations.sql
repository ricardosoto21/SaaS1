create or replace function public.create_appointment_transaction(payload jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id text := payload #>> '{id}';
  v_client_id text := payload #>> '{clientId}';
  v_professional_id text := payload #>> '{professionalId}';
  v_start_at timestamptz := (payload #>> '{startAt}')::timestamptz;
  v_notes text := coalesce(payload #>> '{notes}', '');
  v_created_at timestamptz := coalesce((payload #>> '{createdAt}')::timestamptz, now());
  v_services jsonb := coalesce(payload->'services', '[]'::jsonb);
  v_duration integer;
  v_total numeric(12, 2);
begin
  select
    coalesce(sum(("durationMinutes")::integer), 0),
    coalesce(sum((price)::numeric), 0)
  into v_duration, v_total
  from jsonb_to_recordset(v_services)
    as line(id text, "serviceId" text, price numeric, "durationMinutes" integer, notes text);

  if v_id is null or v_client_id is null or v_professional_id is null or v_start_at is null then
    raise exception 'Cliente, profesional y fecha son obligatorios.';
  end if;

  if v_duration <= 0 or jsonb_array_length(v_services) = 0 then
    raise exception 'Agrega al menos un servicio.';
  end if;

  if exists (
    select 1
    from public.appointments appointment
    where appointment.professional_id = v_professional_id
      and appointment.status in ('scheduled', 'confirmed')
      and tstzrange(appointment.start_at, appointment.start_at + appointment.total_duration_minutes * interval '1 minute', '[)')
        && tstzrange(v_start_at, v_start_at + v_duration * interval '1 minute', '[)')
  ) then
    raise exception 'Ese horario ya esta ocupado por una cita agendada o confirmada.';
  end if;

  insert into public.appointments (
    id, client_id, professional_id, start_at, status, notes, estimated_total, total_duration_minutes, created_at
  )
  values (
    v_id, v_client_id, v_professional_id, v_start_at, 'scheduled', v_notes, v_total, v_duration, v_created_at
  );

  insert into public.appointment_services (id, appointment_id, service_id, price, duration_minutes, notes)
  select id, v_id, "serviceId", price, "durationMinutes", coalesce(notes, '')
  from jsonb_to_recordset(v_services)
    as line(id text, "serviceId" text, price numeric, "durationMinutes" integer, notes text)
  where id is not null and "serviceId" is not null;
end;
$$;

create or replace function public.update_appointment_status_transaction(
  p_appointment_id text,
  p_status public.appointment_status
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_appointment public.appointments%rowtype;
begin
  select *
  into v_appointment
  from public.appointments
  where id = p_appointment_id
  for update;

  if not found then
    raise exception 'Cita no encontrada.';
  end if;

  if p_status in ('scheduled', 'confirmed') and exists (
    select 1
    from public.appointments appointment
    where appointment.id <> p_appointment_id
      and appointment.professional_id = v_appointment.professional_id
      and appointment.status in ('scheduled', 'confirmed')
      and tstzrange(appointment.start_at, appointment.start_at + appointment.total_duration_minutes * interval '1 minute', '[)')
        && tstzrange(v_appointment.start_at, v_appointment.start_at + v_appointment.total_duration_minutes * interval '1 minute', '[)')
  ) then
    raise exception 'Ese horario ya esta ocupado por una cita agendada o confirmada.';
  end if;

  update public.appointments
  set status = p_status
  where id = p_appointment_id;
end;
$$;

create or replace function public.convert_appointment_to_sale_transaction(
  p_appointment_id text,
  p_sale_id text,
  p_sold_at timestamptz,
  p_notes text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_appointment public.appointments%rowtype;
  v_total numeric(12, 2);
begin
  select *
  into v_appointment
  from public.appointments
  where id = p_appointment_id
  for update;

  if not found or v_appointment.sale_id is not null then
    raise exception 'La cita no se puede convertir.';
  end if;

  select coalesce(sum(price), 0)
  into v_total
  from public.appointment_services
  where appointment_id = p_appointment_id;

  if v_total < 0 then
    raise exception 'Total invalido.';
  end if;

  insert into public.sales (
    id, client_id, professional_id, appointment_id, origin, sold_at, notes, total, amount_paid, amount_due, payment_status
  )
  values (
    p_sale_id,
    v_appointment.client_id,
    v_appointment.professional_id,
    v_appointment.id,
    'appointment',
    coalesce(p_sold_at, now()),
    coalesce(p_notes, ''),
    v_total,
    0,
    v_total,
    'unpaid'
  );

  insert into public.sale_items (
    id, sale_id, item_type, service_id, item_name, category_name, quantity, unit_price, total
  )
  select
    'sale-item-' || gen_random_uuid()::text,
    p_sale_id,
    'service',
    service.id,
    service.name,
    category.name,
    1,
    line.price,
    line.price
  from public.appointment_services line
  join public.services service on service.id = line.service_id
  join public.service_categories category on category.id = service.category_id
  where line.appointment_id = p_appointment_id;

  update public.appointments
  set sale_id = p_sale_id,
      status = 'completed'
  where id = p_appointment_id;
end;
$$;

create or replace function public.create_manual_sale_transaction(payload jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sale_id text := payload #>> '{id}';
  v_client_id text := payload #>> '{clientId}';
  v_professional_id text := payload #>> '{professionalId}';
  v_sold_at timestamptz := (payload #>> '{soldAt}')::timestamptz;
  v_notes text := coalesce(payload #>> '{notes}', '');
  v_items jsonb := coalesce(payload->'items', '[]'::jsonb);
  v_initial_payment numeric(12, 2) := coalesce((payload #>> '{initialPayment,amount}')::numeric, 0);
  v_payment_method public.payment_method := coalesce(payload #>> '{initialPayment,method}', 'cash')::public.payment_method;
  v_payment_note text := coalesce(payload #>> '{initialPayment,note}', '');
  v_total numeric(12, 2);
  v_line record;
  v_product public.products%rowtype;
  v_service record;
begin
  if v_sale_id is null or v_client_id is null or v_professional_id is null or v_sold_at is null then
    raise exception 'Cliente, profesional y fecha son obligatorios.';
  end if;

  if jsonb_array_length(v_items) = 0 then
    raise exception 'Agrega al menos un item.';
  end if;

  select coalesce(sum(quantity * "unitPrice"), 0)
  into v_total
  from jsonb_to_recordset(v_items)
    as item(type text, "referenceId" text, quantity numeric, "unitPrice" numeric);

  if v_total <= 0 then
    raise exception 'Total invalido.';
  end if;

  if v_initial_payment < 0 or v_initial_payment > v_total then
    raise exception 'El pago no puede superar el total.';
  end if;

  insert into public.sales (
    id, client_id, professional_id, origin, sold_at, notes, total, amount_paid, amount_due, payment_status
  )
  values (
    v_sale_id,
    v_client_id,
    v_professional_id,
    'manual',
    v_sold_at,
    v_notes,
    v_total,
    v_initial_payment,
    v_total - v_initial_payment,
    case when v_initial_payment = v_total then 'paid'::public.payment_status
         when v_initial_payment > 0 then 'partial'::public.payment_status
         else 'unpaid'::public.payment_status
    end
  );

  for v_line in
    select *
    from jsonb_to_recordset(v_items)
      as item(id text, type text, "referenceId" text, quantity numeric, "unitPrice" numeric)
  loop
    if v_line.quantity <= 0 or v_line."unitPrice" < 0 then
      raise exception 'Item invalido.';
    end if;

    if v_line.type = 'service' then
      select service.id, service.name, category.name as category_name
      into v_service
      from public.services service
      join public.service_categories category on category.id = service.category_id
      where service.id = v_line."referenceId" and service.active = true;

      if not found then
        raise exception 'Servicio no encontrado.';
      end if;

      insert into public.sale_items (
        id, sale_id, item_type, service_id, item_name, category_name, quantity, unit_price, total
      )
      values (
        coalesce(v_line.id, 'sale-item-' || gen_random_uuid()::text),
        v_sale_id,
        'service',
        v_service.id,
        v_service.name,
        v_service.category_name,
        v_line.quantity,
        v_line."unitPrice",
        v_line.quantity * v_line."unitPrice"
      );
    elsif v_line.type = 'product' then
      select *
      into v_product
      from public.products
      where id = v_line."referenceId" and active = true
      for update;

      if not found then
        raise exception 'Producto no encontrado.';
      end if;

      if v_product.current_stock < v_line.quantity then
        raise exception 'Stock insuficiente para %.', v_product.name;
      end if;

      update public.products
      set current_stock = current_stock - v_line.quantity
      where id = v_product.id;

      insert into public.sale_items (
        id, sale_id, item_type, product_id, item_name, category_name, quantity, unit_price, total
      )
      select
        coalesce(v_line.id, 'sale-item-' || gen_random_uuid()::text),
        v_sale_id,
        'product',
        product.id,
        product.name,
        category.name,
        v_line.quantity,
        v_line."unitPrice",
        v_line.quantity * v_line."unitPrice"
      from public.products product
      join public.product_categories category on category.id = product.category_id
      where product.id = v_product.id;

      insert into public.inventory_movements (
        id, product_id, movement_type, quantity, unit_cost, note, happened_at, reference_id
      )
      values (
        'move-' || gen_random_uuid()::text,
        v_product.id,
        'sale',
        -v_line.quantity,
        null,
        'Venta manual',
        v_sold_at,
        v_sale_id
      );
    else
      raise exception 'Tipo de item invalido.';
    end if;
  end loop;

  if v_initial_payment > 0 then
    insert into public.payments (id, sale_id, amount, method, paid_at, note)
    values (
      coalesce(payload #>> '{initialPayment,id}', 'payment-' || gen_random_uuid()::text),
      v_sale_id,
      v_initial_payment,
      v_payment_method,
      v_sold_at,
      v_payment_note
    );
  end if;
end;
$$;

create or replace function public.record_payment_transaction(
  p_sale_id text,
  p_payment_id text,
  p_amount numeric,
  p_method public.payment_method,
  p_paid_at timestamptz,
  p_note text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sale public.sales%rowtype;
  v_amount_paid numeric(12, 2);
  v_amount_due numeric(12, 2);
begin
  select *
  into v_sale
  from public.sales
  where id = p_sale_id
  for update;

  if not found then
    raise exception 'Venta no encontrada.';
  end if;

  if p_amount <= 0 then
    raise exception 'Monto invalido.';
  end if;

  if v_sale.amount_due <= 0 then
    raise exception 'La venta ya esta pagada.';
  end if;

  if p_amount > v_sale.amount_due then
    raise exception 'El abono supera el saldo.';
  end if;

  insert into public.payments (id, sale_id, amount, method, paid_at, note)
  values (p_payment_id, p_sale_id, p_amount, p_method, p_paid_at, coalesce(p_note, ''));

  v_amount_paid := v_sale.amount_paid + p_amount;
  v_amount_due := greatest(0, v_sale.total - v_amount_paid);

  update public.sales
  set amount_paid = v_amount_paid,
      amount_due = v_amount_due,
      payment_status = case when v_amount_due = 0 then 'paid'::public.payment_status
                            when v_amount_paid > 0 then 'partial'::public.payment_status
                            else 'unpaid'::public.payment_status
                       end
  where id = p_sale_id;
end;
$$;

create or replace function public.create_purchase_transaction(payload jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_purchase_id text := payload #>> '{id}';
  v_purchased_at timestamptz := (payload #>> '{purchasedAt}')::timestamptz;
  v_supplier text := payload #>> '{supplier}';
  v_category_name text := payload #>> '{categoryName}';
  v_notes text := coalesce(payload #>> '{notes}', '');
  v_items jsonb := coalesce(payload->'items', '[]'::jsonb);
  v_total numeric(12, 2);
  v_line record;
  v_product public.products%rowtype;
begin
  if v_purchase_id is null or v_purchased_at is null or v_supplier is null or v_category_name is null then
    raise exception 'Proveedor, categoria y fecha son obligatorios.';
  end if;

  if jsonb_array_length(v_items) = 0 then
    raise exception 'Agrega productos a la compra.';
  end if;

  select coalesce(sum(quantity * "unitCost"), 0)
  into v_total
  from jsonb_to_recordset(v_items)
    as item("productId" text, quantity numeric, "unitCost" numeric);

  if v_total <= 0 then
    raise exception 'Total invalido.';
  end if;

  insert into public.purchases (id, purchased_at, supplier, category_name, notes, total)
  values (v_purchase_id, v_purchased_at, v_supplier, v_category_name, v_notes, v_total);

  for v_line in
    select *
    from jsonb_to_recordset(v_items)
      as item(id text, "productId" text, quantity numeric, "unitCost" numeric)
  loop
    if v_line.quantity <= 0 or v_line."unitCost" < 0 then
      raise exception 'Item de compra invalido.';
    end if;

    select *
    into v_product
    from public.products
    where id = v_line."productId" and active = true
    for update;

    if not found then
      raise exception 'Producto no encontrado.';
    end if;

    insert into public.purchase_items (id, purchase_id, product_id, quantity, unit_cost, total)
    values (
      coalesce(v_line.id, 'purchase-item-' || gen_random_uuid()::text),
      v_purchase_id,
      v_product.id,
      v_line.quantity,
      v_line."unitCost",
      v_line.quantity * v_line."unitCost"
    );

    update public.products
    set current_stock = current_stock + v_line.quantity,
        current_cost = v_line."unitCost"
    where id = v_product.id;

    insert into public.inventory_movements (
      id, product_id, movement_type, quantity, unit_cost, note, happened_at, reference_id
    )
    values (
      'move-' || gen_random_uuid()::text,
      v_product.id,
      'purchase',
      v_line.quantity,
      v_line."unitCost",
      'Ingreso por compra',
      v_purchased_at,
      v_purchase_id
    );
  end loop;
end;
$$;

create or replace function public.adjust_stock_transaction(
  p_product_id text,
  p_movement_id text,
  p_quantity_change numeric,
  p_happened_at timestamptz,
  p_note text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_product public.products%rowtype;
  v_next_stock numeric(12, 2);
begin
  select *
  into v_product
  from public.products
  where id = p_product_id and active = true
  for update;

  if not found or p_quantity_change = 0 then
    raise exception 'Producto o cantidad invalida.';
  end if;

  v_next_stock := v_product.current_stock + p_quantity_change;
  if v_next_stock < 0 then
    raise exception 'El stock no puede quedar negativo.';
  end if;

  update public.products
  set current_stock = v_next_stock
  where id = p_product_id;

  insert into public.inventory_movements (
    id, product_id, movement_type, quantity, unit_cost, note, happened_at, reference_id
  )
  values (
    p_movement_id,
    p_product_id,
    'adjustment',
    p_quantity_change,
    null,
    coalesce(p_note, 'Ajuste manual'),
    p_happened_at,
    null
  );
end;
$$;

create or replace function public.create_expense_transaction(payload jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expense_id text := payload #>> '{id}';
  v_category_id text := payload #>> '{categoryId}';
  v_category_name text := payload #>> '{categoryName}';
  v_spent_at timestamptz := (payload #>> '{spentAt}')::timestamptz;
  v_description text := payload #>> '{description}';
  v_amount numeric(12, 2) := (payload #>> '{amount}')::numeric;
begin
  if v_expense_id is null or v_category_id is null or v_category_name is null or v_spent_at is null or v_description is null or v_amount <= 0 then
    raise exception 'Categoria, descripcion y monto son obligatorios.';
  end if;

  insert into public.expense_categories (id, name)
  values (v_category_id, v_category_name)
  on conflict (id) do update set name = excluded.name;

  insert into public.expenses (id, spent_at, category_id, description, amount)
  values (v_expense_id, v_spent_at, v_category_id, v_description, v_amount);
end;
$$;

revoke execute on function public.create_appointment_transaction(jsonb) from public, anon, authenticated;
revoke execute on function public.update_appointment_status_transaction(text, public.appointment_status) from public, anon, authenticated;
revoke execute on function public.convert_appointment_to_sale_transaction(text, text, timestamptz, text) from public, anon, authenticated;
revoke execute on function public.create_manual_sale_transaction(jsonb) from public, anon, authenticated;
revoke execute on function public.record_payment_transaction(text, text, numeric, public.payment_method, timestamptz, text) from public, anon, authenticated;
revoke execute on function public.create_purchase_transaction(jsonb) from public, anon, authenticated;
revoke execute on function public.adjust_stock_transaction(text, text, numeric, timestamptz, text) from public, anon, authenticated;
revoke execute on function public.create_expense_transaction(jsonb) from public, anon, authenticated;

grant execute on function public.create_appointment_transaction(jsonb) to service_role;
grant execute on function public.update_appointment_status_transaction(text, public.appointment_status) to service_role;
grant execute on function public.convert_appointment_to_sale_transaction(text, text, timestamptz, text) to service_role;
grant execute on function public.create_manual_sale_transaction(jsonb) to service_role;
grant execute on function public.record_payment_transaction(text, text, numeric, public.payment_method, timestamptz, text) to service_role;
grant execute on function public.create_purchase_transaction(jsonb) to service_role;
grant execute on function public.adjust_stock_transaction(text, text, numeric, timestamptz, text) to service_role;
grant execute on function public.create_expense_transaction(jsonb) to service_role;
