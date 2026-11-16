-- Execute in a development database after the wardrobe migration.
begin;
insert into auth.users(id,email) values
  ('f1111111-1111-4111-8111-111111111111','rubik-wardrobe-a@example.invalid'),
  ('f2222222-2222-4222-8222-222222222222','rubik-wardrobe-b@example.invalid');
insert into public.profiles(id,name) values
  ('f1111111-1111-4111-8111-111111111111','Wardrobe Test A'),
  ('f2222222-2222-4222-8222-222222222222','Wardrobe Test B');
insert into public.owned_skins(user_id,skin_id)
  values ('f1111111-1111-4111-8111-111111111111','std_matte_pastel_01');

set local role service_role;
do $$
declare
  player uuid := 'f1111111-1111-4111-8111-111111111111';
  other uuid := 'f2222222-2222-4222-8222-222222222222';
  selection text := 'std_matte_pastel_01';
  inventory jsonb;
begin
  inventory := public.skin_inventory(player,false,null);
  if inventory->>'equipped' is not null or jsonb_array_length(inventory->'skins') <> 8 then
    raise exception 'Unexpected default wardrobe or catalogue';
  end if;
  inventory := public.skin_inventory(player,true,selection);
  if inventory->>'equipped' <> selection then raise exception 'Skin not equipped'; end if;
  inventory := public.skin_inventory(player,false,null);
  if inventory->>'equipped' <> selection then raise exception 'Selection lost'; end if;
  begin
    perform public.skin_inventory(other,true,selection);
    raise exception 'Paid skin equipped without ownership';
  exception when raise_exception then
    if sqlerrm <> 'skin_not_owned' then raise; end if;
  end;
  if (select count(*) from public.equipped_skins) <> 1 then raise exception 'Foreign selection changed'; end if;
  inventory := public.skin_inventory(player,true,null);
  if inventory->>'equipped' is not null then raise exception 'Default selection failed'; end if;
end;
$$;

set local role authenticated;
do $$ begin
  if has_table_privilege(current_user,'public.owned_skins','INSERT') or
    has_function_privilege(current_user,'public.skin_inventory(uuid,boolean,text)','EXECUTE') then
    raise exception 'Client can mint or leak ownership';
  end if;
end $$;
rollback;
