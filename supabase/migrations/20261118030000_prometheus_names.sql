begin;
alter table public.user_inventory add column custom_name text,
  add constraint inventory_custom_name_valid check(custom_name is null or
    (char_length(custom_name) between 1 and 32 and custom_name !~ '[[:cntrl:]]'));

create function public.prometheus_equip_guard() returns trigger
language plpgsql set search_path=public as $$
begin
  if new.kind='skin' and new.item_id='s1_red_crimson_core' and new.is_equipped and new.custom_name is null then
    raise exception 'prometheus_name_required';
  end if;
  return new;
end;$$;
create trigger prometheus_equip_guard before insert or update on public.user_inventory
  for each row execute function public.prometheus_equip_guard();

alter function public.skin_shop_action(uuid,text,jsonb,uuid) rename to skin_shop_action_before_prometheus;
revoke all on function public.skin_shop_action_before_prometheus(uuid,text,jsonb,uuid) from public,anon,authenticated,service_role;
create function public.skin_shop_action(p_user uuid,p_action text,p_data jsonb,p_reference uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare snapshot jsonb; receipt public.economy_receipts; payload jsonb; old_name text; new_name text; owned boolean; inventory jsonb;
begin
  if p_action='name_prometheus' then
    new_name:=normalize(btrim(p_data->>'name'),NFC);
    if p_reference is null or new_name is null or char_length(new_name) not between 1 and 32
      or new_name ~ '[[:cntrl:]]' then raise exception 'invalid_prometheus_name'; end if;
    perform public.economy_lock_wallet(p_user);
    payload:=jsonb_build_object('name',new_name);
    select * into receipt from public.economy_receipts where user_id=p_user and kind='prometheus_name' and request_id=p_reference::text;
    if found then
      if receipt.payload is distinct from payload then raise exception 'receipt_mismatch'; end if;
    else
      select custom_name into old_name from public.user_inventory where user_id=p_user and kind='skin'
        and item_id='s1_red_crimson_core' for update;
      owned:=found;
      if not owned then raise exception 'not_owned'; end if;
      if old_name=new_name then raise exception 'prometheus_same_name'; end if;
      if old_name is not null then
        perform public.economy_change_balance(p_user,'CB',-500,'prometheus_rename',p_reference);
      end if;
      update public.user_inventory set custom_name=new_name where user_id=p_user and kind='skin' and item_id='s1_red_crimson_core';
      insert into public.economy_receipts(user_id,kind,request_id,payload,result)
        values(p_user,'prometheus_name',p_reference::text,payload,jsonb_build_object('name',new_name));
    end if;
    snapshot:=public.skin_shop_action_before_prometheus(p_user,'get','{}',null);
  else
    snapshot:=public.skin_shop_action_before_prometheus(p_user,p_action,p_data,p_reference);
  end if;
  -- Personal names exist only in the authenticated owner's shop response.
  -- Shared shop_skins/appearance and public race snapshots remain unchanged.
  select coalesce(jsonb_agg(item||case when item->>'id'='s1_red_crimson_core' and item->>'kind'='skin'
    then jsonb_build_object('customName',i.custom_name,'nameRequired',i.custom_name is null) else '{}'::jsonb end),'[]')
    into inventory from jsonb_array_elements(snapshot->'inventory') item
    left join public.user_inventory i on i.user_id=p_user and i.kind=item->>'kind' and i.item_id=item->>'id';
  return jsonb_set(snapshot,'{inventory}',inventory);
end;$$;
revoke all on function public.skin_shop_action(uuid,text,jsonb,uuid),public.prometheus_equip_guard() from public,anon,authenticated;
grant execute on function public.skin_shop_action(uuid,text,jsonb,uuid) to service_role;
commit;
