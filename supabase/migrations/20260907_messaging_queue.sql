create type public.message_delivery_status as enum ('queued','sent','delivered','failed','skipped');

alter table public.clients add column if not exists whatsapp_opt_out_at timestamptz;

create table if not exists public.message_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  code text not null,
  channel text not null default 'whatsapp',
  body text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(organization_id, code)
);
create table if not exists public.message_deliveries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  appointment_id text not null references public.appointments(id) on delete cascade,
  client_id text not null references public.clients(id) on delete cascade,
  template_code text not null,
  provider text not null default 'whatsapp',
  recipient text not null,
  body text not null,
  scheduled_at timestamptz not null,
  status public.message_delivery_status not null default 'queued',
  provider_message_id text,
  error_message text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique(appointment_id, template_code)
);
alter table public.message_templates enable row level security;
alter table public.message_deliveries enable row level security;
create policy message_templates_tenant on public.message_templates for all to authenticated using (organization_id=public.current_organization_id() and public.is_admin()) with check (organization_id=public.current_organization_id() and public.is_admin());
create policy message_deliveries_tenant on public.message_deliveries for select to authenticated using (organization_id=public.current_organization_id() and public.has_branch_access(branch_id));
grant select, insert, update, delete on public.message_templates, public.message_deliveries to authenticated;

insert into public.message_templates(organization_id,code,body)
select id,'booking_confirmation','Hola {{clientName}}, tu cita quedó confirmada para {{appointmentAt}}.' from public.organizations
on conflict (organization_id,code) do nothing;
insert into public.message_templates(organization_id,code,body)
select id,'reminder_24h','Hola {{clientName}}, te recordamos tu cita de mañana a las {{appointmentAt}}.' from public.organizations
on conflict (organization_id,code) do nothing;
insert into public.message_templates(organization_id,code,body)
select id,'reminder_2h','Hola {{clientName}}, tu cita es en 2 horas: {{appointmentAt}}.' from public.organizations
on conflict (organization_id,code) do nothing;