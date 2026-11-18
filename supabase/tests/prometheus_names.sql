-- Development PostgreSQL only, after all migrations. Every fixture rolls back.
begin;
insert into auth.users(id,email) values('e3333333-3333-4333-8333-333333333333','prometheus-name@example.invalid');
insert into public.profiles(id,name) values('e3333333-3333-4333-8333-333333333333','Prometheus Test');
select public.economy_change_balance('e3333333-3333-4333-8333-333333333333','CB',2000,'fixture',null);
insert into public.user_inventory(user_id,kind,item_id) values('e3333333-3333-4333-8333-333333333333','skin','s1_red_crimson_core');
set local role service_role;
do $$
declare u uuid:='e3333333-3333-4333-8333-333333333333'; before_cb integer; state jsonb; ref uuid:=gen_random_uuid();
begin
  state:=public.skin_shop_action(u,'get','{}',null);before_cb:=(state->>'cb')::integer;
  if not exists(select 1 from jsonb_array_elements(state->'inventory') item where item->>'id'='s1_red_crimson_core' and (item->>'nameRequired')::boolean) then raise exception 'Missing pending claim'; end if;
  begin
    perform public.skin_shop_action(u,'equip_skin','{"id":"s1_red_crimson_core"}',gen_random_uuid());
    raise exception 'Unclaimed skin equipped';
  exception when others then if sqlerrm<>'prometheus_name_required' then raise; end if; end;
  state:=public.skin_shop_action(u,'name_prometheus','{"name":"Lửa đầu tiên"}',gen_random_uuid());
  if (state->>'cb')::integer<>before_cb then raise exception 'Initial name was charged'; end if;
  state:=public.skin_shop_action(u,'name_prometheus','{"name":"Tên mới"}',ref);
  if (state->>'cb')::integer<>before_cb-500 then raise exception 'Rename fee incorrect'; end if;
  state:=public.skin_shop_action(u,'name_prometheus','{"name":"Tên mới"}',ref);
  if (state->>'cb')::integer<>before_cb-500 then raise exception 'Retry charged twice'; end if;
  begin
    perform public.skin_shop_action(u,'name_prometheus','{"name":"Nội dung khác"}',ref);
    raise exception 'Receipt allowed different content';
  exception when others then if sqlerrm<>'receipt_mismatch' then raise; end if; end;
  state:=public.skin_shop_action(u,'equip_skin','{"id":"s1_red_crimson_core"}',gen_random_uuid());
  if not exists(select 1 from jsonb_array_elements(state->'inventory') item where item->>'customName'='Tên mới' and (item->>'equipped')::boolean) then raise exception 'Named skin not equipped'; end if;
end;$$;
rollback;
