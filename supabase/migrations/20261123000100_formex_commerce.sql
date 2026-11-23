begin;
create table public.formex_products (
 slug text primary key check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'), details jsonb not null,
 archived boolean not null default false, featured boolean not null default false, hot boolean not null default false
);
create table public.formex_variants (
 slug text references public.formex_products, storage text not null, details jsonb not null,
 price bigint check(price between 1 and 9000000000), available boolean not null default false,
 primary key(slug,storage)
);
create table public.formex_images (
 slug text references public.formex_products, position int not null check(position>=0), url text not null,
 primary key(slug,position)
);
create table public.formex_admins(user_id uuid primary key references auth.users);
create table public.formex_settings(id boolean primary key default true check(id), delivery_fee bigint check(delivery_fee between 0 and 10000000), pickup_instructions text);
insert into public.formex_settings(id) values(true);
create table public.formex_customers(id uuid primary key default gen_random_uuid(), email text not null, name text not null, phone text not null);
create table public.formex_orders(
 reference uuid primary key, customer_id uuid not null references public.formex_customers,
 slug text not null, storage text not null, model text not null, condition text not null, color text not null, unit_price bigint not null, fee bigint not null,
 amount bigint generated always as (unit_price+fee) stored,
 method text not null check(method in ('pickup','transfer','paystack')),
 fulfilment text not null check(fulfilment in ('pickup','delivery')), address text not null,
 status text not null default 'received' check(status in ('received','preparing','ready','completed','cancelled')),
 created_at timestamptz not null default now(), foreign key(slug,storage) references public.formex_variants
);
create table public.formex_payments(reference uuid primary key references public.formex_orders, paid_at timestamptz, checkout_url text, provider_id text unique, verified_by uuid references public.formex_admins);
create table public.formex_enquiries(id uuid primary key default gen_random_uuid(), contact text not null, message text not null, resolved boolean not null default false, created_at timestamptz not null default now());
do $$
declare t text;
begin
 foreach t in array array['products','variants','images','admins','settings','customers','orders','payments','enquiries'] loop
  execute format('alter table public.%I enable row level security','formex_'||t);
  execute format('revoke all on public.%I from public, anon, authenticated','formex_'||t);
  execute format('grant select, insert, update on public.%I to service_role','formex_'||t);
 end loop;
end $$;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('formex-products','formex-products',true,2097152,array['image/jpeg','image/png','image/webp']);
-- A customer is an immutable order contact snapshot. No identity is inferred from an unverified email.
create function public.formex_checkout(p jsonb) returns public.formex_orders language plpgsql security invoker set search_path='' as $$
declare
 o public.formex_orders; v public.formex_variants; item public.formex_products; fee bigint:=0; c uuid;
 ref uuid := (p->>'reference')::uuid;
begin
 perform pg_advisory_xact_lock(hashtextextended(ref::text,0));
 select * into o from public.formex_orders where reference=ref;
 if found then
  if not exists(select 1 from public.formex_customers where id=o.customer_id and name=p->>'name' and phone=p->>'phone' and email=p->>'email')
   or (o.slug,o.storage,o.condition,o.color,o.method,o.fulfilment,o.address,o.amount) is distinct from
      (p->>'slug',p->>'storage',p->>'condition',coalesce(p->>'color',''),p->>'method',p->>'fulfilment',p->>'address',(p->>'expected')::bigint)
   then raise exception 'Changed order'; end if;
  return o;
 end if;
 select * into strict item from public.formex_products where slug=p->>'slug' and not archived for share;
 select * into strict v from public.formex_variants where slug=item.slug and storage=p->>'storage' and available and price is not null for share;
 if not ((item.details->'conditions') ? (p->>'condition')) or (v.details->>'condition' is not null and v.details->>'condition' <> p->>'condition') then raise exception 'Invalid condition'; end if;
 if p->>'fulfilment'='delivery' then
  select delivery_fee into strict fee from public.formex_settings where id for share;
  if fee is null or p->>'method'='pickup' or length(trim(p->>'address'))<5 then raise exception 'Delivery unavailable'; end if;
 end if;
 if v.price+fee is distinct from (p->>'expected')::bigint then raise exception 'Price changed'; end if;
 insert into public.formex_customers(name,email,phone) values(p->>'name',p->>'email',p->>'phone') returning id into c;
 insert into public.formex_orders(reference,customer_id,slug,storage,model,condition,color,unit_price,fee,method,fulfilment,address)
 values(ref,c,item.slug,v.storage,item.details->>'model',p->>'condition',coalesce(p->>'color',''),v.price,fee,p->>'method',p->>'fulfilment',p->>'address') returning * into o;
 insert into public.formex_payments(reference) values(ref);
 return o;
end $$;
create function public.formex_confirm(ref uuid,kobo bigint,tx text) returns void language plpgsql security invoker set search_path='' as $$
begin
 if not exists(select 1 from public.formex_orders where reference=ref and method='paystack' and amount*100=kobo) then raise exception 'Payment mismatch'; end if;
 update public.formex_payments set paid_at=coalesce(paid_at,now()),provider_id=tx where reference=ref and (provider_id is null or provider_id=tx);
 if not found then raise exception 'Payment conflict'; end if;
end $$;
create function public.formex_staff_order(ref uuid, action text, staff uuid) returns void language plpgsql security invoker set search_path='' as $$
declare o public.formex_orders; paid timestamptz;
begin
 select * into strict o from public.formex_orders where reference=ref for update;
 select paid_at into paid from public.formex_payments where reference=ref;
 if action='confirm' and o.method in ('transfer','pickup') and o.status<>'cancelled' then
  update public.formex_payments set paid_at=now(),verified_by=staff where reference=ref and paid_at is null;
 elsif (o.status,action) in (('received','preparing'),('preparing','ready'),('ready','completed'),('received','cancelled')) then
  if action='cancelled' and (paid is not null or o.method='paystack') then raise exception 'Payment reconciliation required'; end if;
  if paid is null and (action='completed' or (o.fulfilment='delivery' and action<>'cancelled')) then raise exception 'Payment required'; end if;
  update public.formex_orders set status=action where reference=ref;
 else raise exception 'Unavailable action'; end if;
end $$;
revoke all on function public.formex_checkout(jsonb),public.formex_confirm(uuid,bigint,text),public.formex_staff_order(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.formex_checkout(jsonb),public.formex_confirm(uuid,bigint,text),public.formex_staff_order(uuid,text,uuid) to service_role;
commit;
