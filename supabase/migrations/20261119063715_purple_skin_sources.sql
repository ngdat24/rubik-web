begin;

-- Shop writes lock the wallet first. Prevent an in-flight purchase from using
-- a stored offer while its skin and inventory entry are being replaced.
lock table public.user_wallets in exclusive mode;
lock table public.shop_skins, public.shop_season_pool, public.user_inventory,
  public.shop_daily_offers, public.shop_receipts in share row exclusive mode;

create temporary table purple_targets (
  id text primary key,
  season_id text
) on commit drop;

insert into purple_targets (id, season_id) values
  ('epic_brushed_titanium_03', null),
  ('epic_obsidian_chrome_05', null),
  ('epic_frosted_ice_02', null),
  ('epic_stained_glass_04', null),
  ('epic_amber_resin_06', null),
  ('epic_pcb_circuit_01', null),
  ('s1_epic_maglev_coil_01', 'season_01'),
  ('s1_epic_cryo_chamber_02', 'season_01'),
  ('s1_epic_gravity_alloy_03', 'season_01'),
  ('s1_epic_prism_lens_04', 'season_01');

do $$
begin
  if exists (
    select 1 from pg_temp.purple_targets target
    left join public.shop_skins skin on skin.id = target.id and skin.tier = 'purple'
    where skin.id is null or (target.season_id is null and skin.shop_price is null)
  ) then
    raise exception 'Expected ten purple skins with existing Standard prices';
  end if;
end;
$$;

-- Include retired IDs still identifiable from a stored shop snapshot.
create temporary table retired_purple_skins (id text primary key) on commit drop;
insert into retired_purple_skins
select skin.id from public.shop_skins skin
where skin.tier = 'purple' and not exists (select 1 from purple_targets target where target.id = skin.id)
union
select snapshot.skin_id
from (
  select offer.value->'skin'->>'id' as skin_id
  from public.shop_daily_offers shop cross join lateral jsonb_array_elements(shop.offers) offer
  where offer.value->>'tier' = 'purple'
  union
  select item.value->'skin'->>'id'
  from public.shop_receipts receipt cross join lateral jsonb_array_elements(receipt.result) item
  where item.value->'skin'->>'tier' = 'purple'
) snapshot
where snapshot.skin_id is not null
  and not exists (select 1 from public.shop_skins skin where skin.id = snapshot.skin_id);

update public.shop_skins skin
set season_id = target.season_id,
    crates = case when target.season_id is null then array['core','maglev','quantum'] else '{}'::text[] end,
    shop_price = case when target.season_id is null then skin.shop_price end,
    shop_currency = case when target.season_id is null then skin.shop_currency end
from purple_targets target
where skin.id = target.id;

delete from public.shop_season_pool pool
using public.shop_skins skin
where pool.skin_id = skin.id and skin.tier = 'purple'
  and not exists (
    select 1 from purple_targets target where target.id = skin.id and target.season_id = pool.season_id
  );
insert into public.shop_season_pool (season_id, skin_id)
select season_id, id from purple_targets where season_id is not null
on conflict do nothing;

-- Assign different Standard skins the player does not own yet. Process the
-- equipped skin first so it keeps its replacement slot where possible.
create temporary table purple_replacements on commit drop as
with owned_retired as (
  select i.user_id, i.item_id, i.is_equipped,
    row_number() over (partition by i.user_id order by i.is_equipped desc, i.item_id) as position
  from public.user_inventory i join retired_purple_skins retired on retired.id = i.item_id
  where i.kind = 'skin'
), available as (
  select owners.user_id, target.id,
    row_number() over (partition by owners.user_id order by md5(owners.user_id::text || ':' || target.id), target.id) as position
  from (select distinct user_id from owned_retired) owners
  cross join purple_targets target
  where target.season_id is null and not exists (
    select 1 from public.user_inventory i
    where i.user_id = owners.user_id and i.kind = 'skin' and i.item_id = target.id
  )
)
select owned.user_id, owned.item_id, owned.is_equipped, available.id as replacement_id
from owned_retired owned
left join available using (user_id, position);

-- With all six Standard skins owned, discard any surplus legacy copies.
-- If a surplus copy was equipped, equip an already-owned Standard skin.
update purple_replacements replacement
set replacement_id = (
  select id from purple_targets where season_id is null
  order by md5(replacement.user_id::text || ':' || id), id limit 1
)
where replacement.is_equipped and replacement.replacement_id is null;

delete from public.user_inventory inventory
using retired_purple_skins retired
where inventory.kind = 'skin' and inventory.item_id = retired.id;
insert into public.user_inventory (user_id, kind, item_id, is_equipped)
select user_id, 'skin', replacement_id, is_equipped
from purple_replacements where replacement_id is not null
on conflict (user_id, kind, item_id) do update
set is_equipped = excluded.is_equipped
where excluded.is_equipped;

-- Offer snapshots are denormalized. Keep completed purchase slots and reroll
-- counts. Give replaced offers a new UUID so a stale open modal cannot buy a
-- different item or pay a different price using its old offer ID.
with refreshed as (
  select shop.user_id, shop.shop_day,
    jsonb_agg(
      case when entry.value->>'tier' is distinct from 'purple' then entry.value
      when entry.value->>'purchased' = 'true' then
        entry.value || jsonb_build_object('skin', to_jsonb(current_skin))
      else
        entry.value || jsonb_build_object(
          'id', case when candidate.id = entry.value->'skin'->>'id'
                       and candidate.shop_price::text = entry.value->>'price'
                       and candidate.shop_currency = entry.value->>'currency'
                    then entry.value->>'id' else gen_random_uuid()::text end,
          'skin', to_jsonb(candidate), 'price', candidate.shop_price, 'currency', candidate.shop_currency
        )
      end order by entry.ordinality
    ) as offers
  from public.shop_daily_offers shop
  cross join lateral jsonb_array_elements(shop.offers) with ordinality entry
  left join purple_replacements replacement
    on entry.value->>'tier' = 'purple' and replacement.user_id = shop.user_id
    and replacement.item_id = entry.value->'skin'->>'id'
  left join public.shop_skins current_skin
    on entry.value->>'tier' = 'purple' and current_skin.tier = 'purple' and current_skin.season_id is null
    and current_skin.id = coalesce(replacement.replacement_id, entry.value->'skin'->>'id')
    and exists (select 1 from purple_targets target where target.id = current_skin.id)
  left join lateral (
    select skin.* from public.shop_skins skin join purple_targets target on target.id = skin.id
    where target.season_id is null and not exists (
      select 1 from public.user_inventory inventory
      where inventory.user_id = shop.user_id and inventory.kind = 'skin' and inventory.item_id = skin.id
    )
    order by (skin.id = entry.value->'skin'->>'id') desc nulls last,
      md5(shop.user_id::text || ':' || shop.shop_day::text || ':' || skin.id), skin.id
    limit 1
  ) candidate on entry.value->>'tier' = 'purple' and entry.value->>'purchased' is distinct from 'true'
  where shop.offers @> '[{"tier":"purple"}]'
  group by shop.user_id, shop.shop_day
)
update public.shop_daily_offers shop set offers = refreshed.offers
from refreshed where shop.user_id = refreshed.user_id and shop.shop_day = refreshed.shop_day
  and shop.offers is distinct from refreshed.offers;

-- Keep receipt request identities for idempotent retries. Refresh only the
-- displayed skin payload and preserve the original refund/milestone fields.
with refreshed as (
  select receipt.user_id, receipt.request_id,
    jsonb_agg(
      case when item.value->'skin'->>'tier' is distinct from 'purple' then item.value
      when current_skin.id is null then item.value - 'skin'
      else item.value || jsonb_build_object('skin', to_jsonb(current_skin))
      end order by item.ordinality
    ) as result
  from public.shop_receipts receipt
  cross join lateral jsonb_array_elements(receipt.result) with ordinality item
  left join purple_replacements replacement on replacement.user_id = receipt.user_id
    and replacement.item_id = item.value->'skin'->>'id'
  left join purple_targets target on target.id = coalesce(replacement.replacement_id, item.value->'skin'->>'id')
  left join public.shop_skins current_skin on current_skin.id = target.id
  where receipt.result @> '[{"skin":{"tier":"purple"}}]'
  group by receipt.user_id, receipt.request_id
)
update public.shop_receipts receipt set result = refreshed.result
from refreshed where receipt.user_id = refreshed.user_id and receipt.request_id = refreshed.request_id
  and receipt.result is distinct from refreshed.result;

delete from public.shop_skins skin using retired_purple_skins retired where skin.id = retired.id;

commit;
