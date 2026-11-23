begin;
create function public.formex_edit(p jsonb) returns void language plpgsql security invoker set search_path='' as $$
declare k text:=p->>'slug'; label text:=p->>'storage'; stored jsonb; pos int;
begin
 perform pg_advisory_xact_lock(hashtextextended(k,1));
 if p->>'action'='product' then
  insert into public.formex_products(slug,details,archived,featured,hot) values
  (k,p->'details',(p->>'archived')::boolean,(p->>'featured')::boolean,(p->>'hot')::boolean)
  on conflict(slug) do update set details=formex_products.details || jsonb_build_object('model',excluded.details->'model','conditions',excluded.details->'conditions','brand',excluded.details->'brand'),
  archived=excluded.archived,featured=excluded.featured,hot=excluded.hot;
 elsif p->>'action'='variant' then
  select coalesce(max((details->>'position')::int),-1)+1 into pos from public.formex_variants where slug=k;
  if p->>'condition' is not null and not exists(select from public.formex_products where slug=k and (details->'conditions') ? (p->>'condition')) then raise exception 'Invalid condition'; end if;
  stored:=jsonb_build_object('condition',p->'condition','position',pos,'regularPrice',p->'regular','priceNeedsExtraConfirmation',false,'sellingPrice',p->'price','availability',case when (p->>'available')::boolean then 'Available' else 'Confirm availability' end);
  insert into public.formex_variants(slug,storage,details,price,available) values(k,label,stored,(p->>'price')::bigint,(p->>'available')::boolean)
  on conflict(slug,storage) do update set details=formex_variants.details || (excluded.details-'position'),price=excluded.price,available=excluded.available;
  update public.formex_products set details=jsonb_set(details,'{defaultStorage}',to_jsonb(label)) where slug=k and coalesce(details->>'defaultStorage','')='';
 elsif p->>'action'='image' then
  select coalesce(max(position),-1)+1 into pos from public.formex_images where slug=k;
  insert into public.formex_images values(k,pos,p->>'url');
 else raise exception 'Unknown action'; end if;
end $$;
revoke all on function public.formex_edit(jsonb) from public,anon,authenticated;
grant execute on function public.formex_edit(jsonb) to service_role;
commit;
