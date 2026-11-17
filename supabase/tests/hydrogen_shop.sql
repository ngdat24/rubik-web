-- Run as postgres against a development database after the two shop migrations.
begin;
insert into auth.users(id,email) values
  ('f1111111-1111-4111-8111-111111111111','rubik-shop-a@example.invalid'),
  ('f2222222-2222-4222-8222-222222222222','rubik-shop-b@example.invalid');
insert into public.profiles(id,name) values ('f1111111-1111-4111-8111-111111111111','Shop Test A');
update public.shop_seasons set starts_at=now()-interval '1 day',ends_at=now()+interval '10 days',
  legacy_shop_unlock_at=now()+interval '40 days' where id='season_01';
create or replace function public.shop_roll() returns integer language sql as $$ select 0 $$;

set local role service_role;
do $$
declare
  player uuid := 'f1111111-1111-4111-8111-111111111111';
  guest uuid := 'f2222222-2222-4222-8222-222222222222';
  ref uuid := gen_random_uuid(); state jsonb; opened jsonb; first_skin text; stale_offer text;
begin
  if (select count(*) from public.shop_skins) <> 30 then raise exception 'Missing catalogue'; end if;
  begin
    perform public.skin_shop_action(guest,'get','{}',null);
    raise exception 'Guest was accepted';
  exception when raise_exception then
    if sqlerrm <> 'profile_required' then raise; end if;
  end;
  if exists(select 1 from public.user_wallets where user_id=guest) then raise exception 'Guest wallet created'; end if;
  state := public.skin_shop_action(player,'get','{}',null);
  if (state->>'cb')::int <> 0 or (state->>'zn')::int <> 0 or jsonb_array_length(state->'offers') <> 4 then
    raise exception 'Incorrect starter wallet or offers';
  end if;

  perform public.economy_change_balance(player,'CB',250,'test',null);
  opened := public.skin_shop_action(player,'open_crate','{"crate":"core","quantity":1}',ref);
  state := public.skin_shop_action(player,'open_crate','{"crate":"core","quantity":1}',ref);
  first_skin := opened->'result'->0->'skin'->>'id';
  if (state->>'cb')::int <> 50 or state->'result' <> opened->'result' or jsonb_array_length(state->'inventory') <> 1 then
    raise exception 'Retry spent twice or returned a different prize';
  end if;
  state := public.skin_shop_action(player,'equip_skin',jsonb_build_object('id',first_skin),gen_random_uuid());
  if not (state->'inventory'->0->>'equipped')::boolean then raise exception 'Equip failed'; end if;
  state := public.skin_inventory(player,false,null);
  if state->>'equipped' is distinct from first_skin then raise exception 'Legacy read missed shop equip'; end if;
  if jsonb_array_length(state->'skins'->0->'colors')<>6 then raise exception 'Legacy palette malformed'; end if;
  perform public.skin_inventory(player,true,null);
  if exists(select 1 from public.user_inventory where user_id=player and kind='skin' and is_equipped)
    then raise exception 'Legacy unequip did not clear shop inventory'; end if;
  perform public.skin_inventory(player,true,first_skin);
  if not exists(select 1 from public.user_inventory where user_id=player and item_id=first_skin and is_equipped)
    then raise exception 'Legacy equip did not update shop inventory'; end if;
  begin
    perform public.skin_inventory(player,true,'s1_red_crimson_core');
    raise exception 'Legacy endpoint accepted unowned skin';
  exception when raise_exception then
    if sqlerrm<>'skin_not_owned' then raise; end if;
  end;

  begin
    perform public.skin_shop_action(player,'buy_skin','{"offerId":"s1_red_crimson_core"}',gen_random_uuid());
    raise exception 'Direct red purchase was accepted';
  exception when raise_exception then
    if sqlerrm <> 'offer_unavailable' then raise; end if;
  end;

  perform public.shop_change_balance(player,'CB',1000,'test',null);
  -- Own the rest of the white tier so the fixed Core roll must refund CB.
  insert into public.user_inventory(user_id,kind,item_id)
    select player,'skin',id from public.shop_skins where tier='white' on conflict do nothing;
  state := public.skin_shop_action(player,'open_crate','{"crate":"core","quantity":1}',gen_random_uuid());
  if (state->'result'->0->'refund'->>'amount')::int <> 40 or (state->>'cb')::int <> 890 then
    raise exception 'Incorrect duplicate refund';
  end if;
  update public.shop_crate_progress set purple_misses=19 where user_id=player and crate='core';
  state := public.skin_shop_action(player,'open_crate','{"crate":"core","quantity":1}',gen_random_uuid());
  if state->'result'->0->'skin'->>'tier' <> 'purple' then raise exception 'Core guarantee not applied'; end if;

  perform public.shop_change_balance(player,'CB',60000,'test',null);
  perform public.shop_change_balance(player,'ZN',100,'test',null);
  state := public.skin_shop_action(player,'get','{}',null);
  if (state->>'cb')::int <> 50000 or (state->>'zn')::int <> 60 then raise exception 'Wallet cap exceeded'; end if;
  stale_offer := state->'offers'->1->>'id';
  state := public.skin_shop_action(player,'reroll','{}',gen_random_uuid());
  first_skin := state->'offers'->1->'skin'->>'id';
  begin
    perform public.skin_shop_action(player,'buy_skin',jsonb_build_object('offerId',stale_offer),gen_random_uuid());
    raise exception 'Stale offer was accepted';
  exception when raise_exception then
    if sqlerrm <> 'offer_unavailable' then raise; end if;
  end;
  state := public.skin_shop_action(player,'buy_skin',jsonb_build_object('offerId',state->'offers'->1->>'id'),gen_random_uuid());
  if (state->>'cb')::int <> 49200 then raise exception 'Incorrect rotation price'; end if;
  state := public.skin_shop_action(player,'reroll','{}',gen_random_uuid());
  if not (state->'offers'->1->>'purchased')::boolean or state->'offers'->1->'skin'->>'id' <> first_skin then
    raise exception 'Purchased slot was refreshed';
  end if;
  state := public.skin_shop_action(player,'buy_utility','{"id":"util_nameplate_7d","currency":"CB"}',gen_random_uuid());
  if not exists(select 1 from public.user_inventory where user_id=player and item_id='util_nameplate_7d'
    and expires_at=now()+interval '7 days') then raise exception 'Rental duration incorrect'; end if;
  if public.shop_nameplate(player) <> 'neon' then raise exception 'Active nameplate not published'; end if;
  perform public.skin_shop_action(player,'buy_utility','{"id":"fx_sound_purple_01","currency":"ZN"}',gen_random_uuid());
  state := public.skin_shop_action(player,'equip_utility','{"id":"fx_sound_purple_01","slot":"sound"}',gen_random_uuid());
  if not exists(select 1 from public.user_inventory where user_id=player and item_id='fx_sound_purple_01'
    and is_equipped) then raise exception 'Sound pack equip failed'; end if;
  update public.profiles set name='Shop Test Rename 1' where id=player;
  update public.profiles set name='Shop Test Rename 2' where id=player;
  if (select count(*) from public.currency_ledger where user_id=player and reason='profile_rename' and amount=-500) <> 1
    then raise exception 'Wrong rename fee'; end if;
  state := public.skin_shop_action(player,'spin','{"season":"season_01","quantity":5}',gen_random_uuid());
  if (state->'season'->>'spins')::int <> 1 or (state->>'zn')::int <> 55 or state->'season'->'milestones' <> '[5,10,15,20,30]' or
    not exists(select 1 from public.user_inventory where user_id=player and item_id='s1_red_crimson_core') then
    raise exception 'Early red did not award all milestones';
  end if;
  begin
    perform public.skin_shop_action(player,'spin','{"season":"season_01","quantity":5}',gen_random_uuid());
    raise exception 'Completed season accepted a second spin';
  exception when raise_exception then
    if sqlerrm <> 'season_complete' then raise; end if;
  end;
  if (select sum(amount) from public.currency_ledger where user_id=player and currency_type='CB') <> (state->>'cb')::int
    or (select sum(amount) from public.currency_ledger where user_id=player and currency_type='ZN') <> (state->>'zn')::int then
    raise exception 'Ledger does not reconcile with wallet';
  end if;
end;
$$;

set local role authenticated;
do $$ begin
  if has_table_privilege(current_user,'public.user_wallets','SELECT') or
    has_function_privilege(current_user,'public.skin_shop_action(uuid,text,jsonb,uuid)','EXECUTE') then
    raise exception 'Browser credentials can access the wallet directly';
  end if;
end $$;
reset role;
create or replace function public.shop_roll() returns integer language sql as $$ select 999 $$;
insert into public.profiles(id,name) values ('f2222222-2222-4222-8222-222222222222','Season Pity Test');
set local role service_role;
do $$
declare
  player uuid:='f2222222-2222-4222-8222-222222222222'; data jsonb; rules jsonb; next_state jsonb;
begin
  rules:=public.shop_catalog();
  if (select sum((band->>'weight')::int) from jsonb_array_elements(rules->'wheel'->'bands') band)<>1000
      or exists(select 1 from jsonb_each(rules->'crates') crate where
        (select sum((band->>'weight')::int) from jsonb_array_elements(crate.value->'bands') band)<>1000)
    then raise exception 'Invalid draw table'; end if;
  perform public.economy_change_balance(player,'ZN',10,'test',null);
  insert into public.season_gacha_progress(user_id,season_id,spin_count,claimed_milestones)
    values(player,'season_01',19,array[5,10,15]);
  data:='{"season":"season_01","quantity":1}';
  next_state:=public.skin_shop_action(player,'spin',data,gen_random_uuid());
  if next_state->'result'->0->'skin'->>'tier'<>'gold' or (next_state->>'cb')::int<>0 or
    (next_state->>'zn')::int<>9 then raise exception 'Gold guarantee must replace the random result'; end if;
  update public.season_gacha_progress set spin_count=29 where user_id=player;
  next_state:=public.skin_shop_action(player,'spin',data,gen_random_uuid());
  if next_state->'result'->0->'skin'->>'tier'<>'red' or (next_state->>'cb')::int<>0 or
    (next_state->>'zn')::int<>8 then raise exception 'Red guarantee must replace the random result'; end if;
end;
$$;
rollback;
