begin;
alter table public.formex_payments add column attempt uuid unique, add column initializing_until timestamptz;
create function public.formex_start_payment(ref uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare pay public.formex_payments;
begin
 select * into strict pay from public.formex_payments where reference=ref for update;
 if pay.paid_at is not null then return '{"status":"paid"}'; end if;
 if pay.checkout_url is not null then return jsonb_build_object('url',pay.checkout_url); end if;
 if pay.initializing_until>now() then return '{"status":"initializing"}'; end if;
 update public.formex_payments set attempt=gen_random_uuid(),initializing_until=now()+interval '45 seconds' where reference=ref returning * into pay;
 return jsonb_build_object('attempt',pay.attempt);
end $$;
revoke all on function public.formex_start_payment(uuid) from public,anon,authenticated;
grant execute on function public.formex_start_payment(uuid) to service_role;
commit;
