create table if not exists public.public_rate_limits (
  scope text not null,
  subject_hash text not null,
  window_start timestamptz not null,
  request_count integer not null default 0,
  primary key(scope,subject_hash,window_start)
);

create or replace function public.consume_public_rate_limit(p_scope text,p_subject_hash text,p_limit integer,p_window_seconds integer)
returns boolean language plpgsql security definer set search_path=public as $$
declare v_start timestamptz := to_timestamp(floor(extract(epoch from now())/p_window_seconds)*p_window_seconds); v_count integer;
begin
  if p_limit<1 or p_window_seconds<1 or length(p_scope)>80 or length(p_subject_hash)<>64 then raise exception 'Invalid rate limit input' using errcode='P0002'; end if;
  insert into public.public_rate_limits(scope,subject_hash,window_start,request_count) values(p_scope,p_subject_hash,v_start,1) on conflict(scope,subject_hash,window_start) do update set request_count=public.public_rate_limits.request_count+1 where public.public_rate_limits.request_count<p_limit returning request_count into v_count;
  return v_count is not null;
end $$;
revoke all on public.public_rate_limits from public,anon,authenticated;
revoke all on function public.consume_public_rate_limit(text,text,integer,integer) from public,anon,authenticated;