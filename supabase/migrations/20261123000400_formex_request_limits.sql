begin;
create table public.formex_request_limits(key text primary key,window_start timestamptz not null,requests integer not null);
alter table public.formex_request_limits enable row level security;
revoke all on public.formex_request_limits from public,anon,authenticated;
grant select,insert,update,delete on public.formex_request_limits to service_role;
create index formex_request_limits_expiry on public.formex_request_limits(window_start);
create function public.formex_limit(k text,cap integer) returns boolean language plpgsql security invoker set search_path='' as $$
declare n int; w timestamptz:=date_trunc('hour',now());
begin
 delete from public.formex_request_limits where window_start<w-interval '1 day';
 insert into public.formex_request_limits as limits values(k,w,1) on conflict(key) do update
 set requests=case when limits.window_start=excluded.window_start then least(limits.requests+1,cap+1) else 1 end,window_start=excluded.window_start returning requests into n;
 return n<=cap;
end $$;
revoke all on function public.formex_limit(text,integer) from public,anon,authenticated;
grant execute on function public.formex_limit(text,integer) to service_role;
commit;
