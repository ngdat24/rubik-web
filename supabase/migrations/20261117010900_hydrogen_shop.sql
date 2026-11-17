begin;

create table public.shop_catalog_rules (
  singleton boolean primary key default true check (singleton),
  rules jsonb not null
);
insert into public.shop_catalog_rules(rules) values ($catalog$
{
  "version": "hydrogen-v2",
  "reroll": [
    50,
    150,
    350,
    700
  ],
  "crates": {
    "core": {
      "currency": "CB",
      "single": 200,
      "quantity": 10,
      "batch": 1800,
      "purple": 20,
      "gold": 0,
      "bands": [
        {
          "id": "white",
          "weight": 650
        },
        {
          "id": "blue",
          "weight": 300
        },
        {
          "id": "purple",
          "weight": 50
        }
      ]
    },
    "maglev": {
      "currency": "CB",
      "single": 500,
      "quantity": 10,
      "batch": 4500,
      "purple": 8,
      "gold": 35,
      "bands": [
        {
          "id": "white",
          "weight": 250
        },
        {
          "id": "blue",
          "weight": 480
        },
        {
          "id": "purple",
          "weight": 240
        },
        {
          "id": "gold",
          "weight": 30
        }
      ]
    },
    "quantum": {
      "currency": "ZN",
      "single": 2,
      "quantity": 5,
      "batch": 9,
      "purple": 4,
      "gold": 10,
      "bands": [
        {
          "id": "blue",
          "weight": 450
        },
        {
          "id": "purple",
          "weight": 430
        },
        {
          "id": "gold",
          "weight": 120
        }
      ]
    }
  },
  "utilities": {
    "fx_sound_purple_01": {
      "CB": 1200,
      "ZN": 4
    },
    "fx_trail_purple_01": {
      "CB": 1600,
      "ZN": 5
    },
    "fx_trail_gold_01": {
      "ZN": 10
    },
    "util_nameplate_7d": {
      "CB": 800,
      "days": 7
    },
    "util_nameplate_30d": {
      "CB": 2500,
      "ZN": 5,
      "days": 30
    }
  },
  "refunds": {
    "crate": {
      "white": [
        "CB",
        40
      ],
      "blue": [
        "CB",
        100
      ],
      "purple": [
        "CB",
        250
      ],
      "gold": [
        "CB",
        600
      ]
    },
    "season": {
      "white": [
        "CB",
        40
      ],
      "blue": [
        "CB",
        100
      ],
      "purple": [
        "CB",
        200
      ],
      "gold": [
        "ZN",
        5
      ]
    }
  },
  "wheel": {
    "single": 1,
    "batches": [
      1,
      5,
      10
    ],
    "bands": [
      {
        "id": "red",
        "weight": 20
      },
      {
        "id": "gold",
        "weight": 30
      },
      {
        "id": "purple",
        "weight": 125
      },
      {
        "id": "blue",
        "weight": 175
      },
      {
        "id": "white",
        "weight": 250
      },
      {
        "id": "cb200",
        "weight": 150
      },
      {
        "id": "cb100",
        "weight": 250
      }
    ],
    "milestoneCB": {
      "5": 300,
      "15": 500
    }
  }
}
$catalog$);

create function public.shop_catalog()
returns jsonb language sql stable security invoker set search_path = '' as $$
  select rules from public.shop_catalog_rules where singleton
$$;

create function public.shop_band(p_bands jsonb,p_roll integer)
returns text language sql immutable strict set search_path = '' as $$
  select pick.item->>'id' from (
    select band.item,sum((band.item->>'weight')::integer) over(order by band.ord) as threshold
    from jsonb_array_elements(p_bands) with ordinality band(item,ord)
  ) pick where p_roll<pick.threshold order by pick.threshold limit 1
$$;

create table public.shop_skins (
  id text primary key,
  name text not null,
  tier text not null check (tier in ('white','blue','purple','gold','red')),
  season_id text references public.shop_seasons(id),
  appearance jsonb not null check (jsonb_typeof(appearance) = 'object'),
  shop_price integer check (shop_price > 0),
  shop_currency text check (shop_currency in ('CB','ZN')),
  crates text[] not null default '{}' check (crates <@ array['core','maglev','quantum']),
  check ((shop_price is null) = (shop_currency is null)),
  check (tier <> 'red' or (season_id is not null and shop_price is null and cardinality(crates) = 0)),
  check (season_id is null or cardinality(crates) = 0),
  check (tier not in ('gold','red') or not ('core' = any(crates))),
  check (tier <> 'white' or not ('quantum' = any(crates)))
);

-- Seasonal pools can reuse standard skins. The same seasonal gold/red model
-- serves both the random drop and its guaranteed milestone.
create table public.shop_season_pool (
  season_id text references public.shop_seasons(id) on delete cascade,
  skin_id text references public.shop_skins(id),
  primary key (season_id,skin_id)
);

create table public.user_inventory (
  user_id uuid not null references public.user_wallets(user_id) on delete cascade,
  kind text not null check (kind in ('skin','utility')),
  item_id text not null,
  is_equipped boolean not null default false,
  expires_at timestamptz,
  primary key (user_id,kind,item_id)
);
create unique index shop_equipped_skin on public.user_inventory(user_id)
  where kind = 'skin' and is_equipped;

create table public.shop_daily_offers (
  user_id uuid references public.user_wallets(user_id) on delete cascade,
  shop_day date,
  rerolls integer not null default 0 check (rerolls between 0 and 4),
  offers jsonb not null default '[]',
  primary key (user_id,shop_day)
);

create table public.shop_crate_progress (
  user_id uuid references public.user_wallets(user_id) on delete cascade,
  crate text check (crate in ('core','maglev','quantum')),
  purple_misses integer not null default 0,
  gold_misses integer not null default 0,
  primary key (user_id,crate)
);

create table public.season_gacha_progress (
  user_id uuid references public.user_wallets(user_id) on delete cascade,
  season_id text references public.shop_seasons(id),
  spin_count integer not null default 0,
  claimed_milestones integer[] not null default '{}',
  primary key (user_id,season_id)
);

create table public.shop_receipts (
  user_id uuid references public.user_wallets(user_id) on delete cascade,
  request_id uuid,
  action text not null,
  data jsonb not null,
  result jsonb not null,
  primary key (user_id,request_id)
);

create table public.shop_profile_renames (
  user_id uuid primary key references public.profiles(id) on delete cascade
);

do $$
declare table_name text;
begin
  foreach table_name in array array['shop_catalog_rules','shop_skins','shop_season_pool',
    'user_inventory','shop_daily_offers',
    'shop_crate_progress','season_gacha_progress','shop_receipts','shop_profile_renames']
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on public.%I from public, anon, authenticated', table_name);
    execute format('grant select, insert, update, delete on public.%I to service_role', table_name);
  end loop;
end;
$$;

create function public.shop_change_balance(p_user uuid,p_currency text,p_amount integer,p_reason text,p_reference uuid)
returns jsonb language sql security invoker set search_path = '' as $$
  select public.economy_change_balance(p_user,p_currency,p_amount,p_reason,p_reference,p_reason='duplicate_skin')
$$;

create function public.shop_charge_rename()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  insert into public.shop_profile_renames(user_id) values(old.id) on conflict do nothing;
  if not found then
    perform public.shop_change_balance(old.id,'CB',-500,'profile_rename',null);
  end if;
  return new;
exception when no_data_found then raise exception 'insufficient_balance';
end;
$$;

create trigger shop_profile_rename before update of name on public.profiles
  for each row when (old.name is distinct from new.name) execute function public.shop_charge_rename();

create function public.shop_nameplate(p_user uuid)
returns text language sql stable security invoker set search_path = '' as $$
  select case item_id when 'util_nameplate_30d' then 'gold' else 'neon' end
  from public.user_inventory where user_id=p_user and kind='utility'
    and item_id in ('util_nameplate_7d','util_nameplate_30d') and expires_at > now()
  order by (item_id='util_nameplate_30d') desc limit 1
$$;

create function public.leaderboard_with_nameplates(p_size integer)
returns table(id uuid,name text,"timeMs" bigint,nameplate text)
language sql stable security invoker set search_path = '' as $$
  select board.id,board.name,board."timeMs",public.shop_nameplate(board.id)
    from public.leaderboard(p_size) with ordinality board order by board.ordinality
$$;

create function public.shop_skin_appearance(p_id text)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object('id',id,'appearance',appearance) from public.shop_skins where id=p_id
$$;

create function public.lobby_action_with_nameplates(p_user uuid,p_code text,p_action text,p_payload jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare snapshot jsonb; plates jsonb; skins jsonb;
begin
  snapshot := public.lobby_action_with_escrow(p_user,p_code,p_action,p_payload);
  if snapshot->'room'->'players' is null then return snapshot; end if;
  select jsonb_object_agg(player->>'id',public.shop_nameplate((player->>'id')::uuid))
    into plates from jsonb_array_elements(snapshot->'room'->'players') player;
  select jsonb_object_agg(player->>'id',skin.item_id) into skins
    from jsonb_array_elements(snapshot->'room'->'players') player
    join public.user_inventory skin on skin.user_id=(player->>'id')::uuid and skin.kind='skin' and skin.is_equipped;
  return snapshot || jsonb_build_object('nameplates',coalesce(plates,'{}'),'skins',coalesce(skins,'{}'));
end;
$$;

create function public.shop_make_offers(p_user uuid, p_day date, p_seed uuid, p_rerolls integer, p_previous jsonb)
returns jsonb language sql security invoker set search_path = '' as $$
  select coalesce(jsonb_agg(
    case when old.value->>'purchased' = 'true' then old.value else
      jsonb_build_object('id',gen_random_uuid(),'tier',slot.tier,'skin',to_jsonb(candidate),'purchased',false,
        'currency',candidate.shop_currency,'price',candidate.shop_price)
    end order by slot.ordinality), '[]'::jsonb)
  from unnest(array['white','blue','purple','gold']) with ordinality slot(tier,ordinality)
  left join lateral (
    select value from jsonb_array_elements(p_previous) where value->>'tier' = slot.tier
  ) old on true
  left join lateral (
    select skin.* from public.shop_skins skin left join public.shop_seasons season on season.id = skin.season_id
    where skin.tier = slot.tier and skin.shop_price is not null and old.value->>'purchased' is distinct from 'true'
      and (skin.season_id is null or now() >= season.legacy_shop_unlock_at)
      and not exists(select 1 from public.user_inventory owned
        where owned.user_id = p_user and owned.kind = 'skin' and owned.item_id = skin.id)
    order by sha256(convert_to(p_seed::text || ':' || p_day::text || ':' || p_rerolls || ':' || skin.id,'UTF8')), skin.id
    limit 1
  ) candidate on true
$$;

create function public.shop_pick_skin(p_user uuid, p_tier text, p_crate text, p_season text,
  p_reference uuid, p_prefer_new boolean default true)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare skin public.shop_skins; refund jsonb; refund_rule jsonb; added integer;
begin
  select s.* into skin from public.shop_skins s
    where s.tier = p_tier and
      (p_crate = any(s.crates) or exists(select 1 from public.shop_season_pool pool
        where pool.season_id = p_season and pool.skin_id = s.id))
    order by (p_prefer_new and exists(select 1 from public.user_inventory owned where owned.user_id = p_user
      and owned.kind = 'skin' and owned.item_id = s.id)), gen_random_uuid()
    limit 1;
  if not found then raise exception 'catalog_unavailable'; end if;

  insert into public.user_inventory(user_id,kind,item_id) values(p_user,'skin',skin.id)
    on conflict do nothing;
  get diagnostics added = row_count;
  if added = 0 then
    refund_rule:=public.shop_catalog()->'refunds'->(case when p_season is null then 'crate' else 'season' end)->p_tier;
    if refund_rule is not null then
      refund:=public.shop_change_balance(p_user,refund_rule->>0,(refund_rule->>1)::integer,'duplicate_skin',p_reference);
    end if;
  end if;
  return jsonb_build_object('skin',to_jsonb(skin),'refund',refund);
end;
$$;

create function public.shop_utility_catalog()
returns table(id text, cb integer, zn integer, days integer)
language sql stable security invoker set search_path = '' as $$
  select item.key,(item.value->>'CB')::integer,(item.value->>'ZN')::integer,(item.value->>'days')::integer
    from jsonb_each(public.shop_catalog()->'utilities') item
$$;

create function public.shop_roll()
returns integer language plpgsql security invoker set search_path = '' as $$
declare bytes bytea; draw integer;
begin
  loop
    bytes := uuid_send(gen_random_uuid());
    draw := get_byte(bytes,0)*256 + get_byte(bytes,1);
    if draw < 65000 then return draw % 1000; end if;
  end loop;
end;
$$;

create function public.skin_shop_action(p_user uuid, p_action text, p_data jsonb, p_reference uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  wallet public.user_wallets; day_shop public.shop_daily_offers;
  crate_progress public.shop_crate_progress; progress public.season_gacha_progress;
  season public.shop_seasons; receipt public.shop_receipts; offer jsonb; utility record;
  drop_data jsonb; result jsonb := '[]'; inventory jsonb; selected_currency text; selected_tier text;
  current_shop_day date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
  selected_crate text; quantity integer; cost integer; roll integer; milestone integer;
  rules jsonb:=public.shop_catalog(); crate_rule jsonb; wheel jsonb; per_spin integer;
  purple_pity integer; gold_pity integer; season_valid boolean := false; crate_catalog jsonb; effect_ids text[];
begin
  wallet:=public.economy_lock_wallet(p_user);

  if p_action <> 'get' then
    if p_reference is null then raise exception 'invalid_action'; end if;
    select * into receipt from public.shop_receipts where user_id = p_user and request_id = p_reference;
    if found and (receipt.action <> p_action or receipt.data <> p_data) then raise exception 'invalid_action'; end if;
  end if;

  insert into public.shop_daily_offers(user_id,shop_day,offers)
    values(p_user,current_shop_day,public.shop_make_offers(p_user,current_shop_day,wallet.shop_seed,0,'[]'))
    on conflict do nothing;
  select * into day_shop from public.shop_daily_offers offers where offers.user_id = p_user and offers.shop_day = current_shop_day;
  select * into season from public.shop_seasons where now() >= starts_at and now() < ends_at;
  if found then
    select count(distinct s.tier) = 5 and count(*) filter(where s.tier = 'gold') = 1
      and count(*) filter(where s.tier = 'red') = 1
      and coalesce(bool_and(s.season_id = season.id) filter(where s.tier in ('gold','red')),false)
      into season_valid from public.shop_season_pool pool join public.shop_skins s on s.id = pool.skin_id
      where pool.season_id = season.id;
    select * into progress from public.season_gacha_progress
      where user_id = p_user and season_id = season.id;
  end if;

  if receipt.request_id is not null then
    result := receipt.result;
  elsif p_action = 'buy_skin' then
    select value into offer from jsonb_array_elements(day_shop.offers)
      where value->>'id' = p_data->>'offerId' and value->'skin' <> 'null'::jsonb and value->>'purchased' = 'false';
    if not found then raise exception 'offer_unavailable'; end if;
    insert into public.user_inventory(user_id,kind,item_id) values(p_user,'skin',offer->'skin'->>'id')
      on conflict do nothing;
    if not found then raise exception 'already_owned'; end if;
    perform public.shop_change_balance(p_user,offer->>'currency',-(offer->>'price')::integer,'buy_skin',p_reference);
    select jsonb_agg(case when value = offer then value || '{"purchased":true}'::jsonb else value end order by ordinality)
      into day_shop.offers from jsonb_array_elements(day_shop.offers) with ordinality;
    update public.shop_daily_offers d set offers = day_shop.offers
      where d.user_id = p_user and d.shop_day = day_shop.shop_day;
  elsif p_action = 'reroll' then
    if day_shop.rerolls >= 4 then raise exception 'reroll_limit'; end if;
    if not exists(select 1 from jsonb_array_elements(day_shop.offers)
      where value->'skin' <> 'null'::jsonb and value->>'purchased' = 'false') then raise exception 'offer_unavailable'; end if;
    cost := (rules->'reroll'->>day_shop.rerolls)::integer;
    perform public.shop_change_balance(p_user,'CB',-cost,'reroll',p_reference);
    day_shop.rerolls := day_shop.rerolls+1;
    day_shop.offers := public.shop_make_offers(p_user,current_shop_day,wallet.shop_seed,day_shop.rerolls,day_shop.offers);
    update public.shop_daily_offers d set rerolls = day_shop.rerolls, offers = day_shop.offers
      where d.user_id = p_user and d.shop_day = day_shop.shop_day;
  elsif p_action = 'buy_utility' then
    select * into utility from public.shop_utility_catalog() where id = p_data->>'id';
    if not found then raise exception 'offer_unavailable'; end if;
    selected_currency := p_data->>'currency';
    cost := case selected_currency when 'CB' then utility.cb when 'ZN' then utility.zn end;
    if cost is null then raise exception 'invalid_action'; end if;
    if utility.days is null and exists(select 1 from public.user_inventory
      where user_id = p_user and kind = 'utility' and item_id = utility.id) then raise exception 'already_owned'; end if;
    perform public.shop_change_balance(p_user,selected_currency,-cost,'buy_utility',p_reference);
    insert into public.user_inventory as owned(user_id,kind,item_id,expires_at)
      values(p_user,'utility',utility.id,now()+make_interval(days => utility.days))
      on conflict (user_id,kind,item_id) do update set expires_at =
        greatest(owned.expires_at,now()) + make_interval(days => utility.days);
  elsif p_action = 'equip_skin' then
    if p_data->>'id' is not null and not exists(select 1 from public.user_inventory
      where user_id = p_user and kind = 'skin' and item_id = p_data->>'id') then raise exception 'not_owned'; end if;
    update public.user_inventory set is_equipped = false where user_id = p_user and kind = 'skin' and is_equipped;
    update public.user_inventory set is_equipped = true where user_id = p_user and kind = 'skin' and item_id = p_data->>'id';
  elsif p_action = 'equip_utility' then
    if p_data->>'slot' = 'sound' then
      effect_ids := array['fx_sound_purple_01'] || array(select sound_pack_id from public.shop_seasons);
    elsif p_data->>'slot' = 'trail' then
      effect_ids := array['fx_trail_purple_01','fx_trail_gold_01'];
    else raise exception 'invalid_action';
    end if;
    if p_data->>'id' is not null and not exists(select 1 from public.user_inventory
      where user_id = p_user and kind = 'utility' and item_id = p_data->>'id' and item_id = any(effect_ids))
      then raise exception 'not_owned'; end if;
    update public.user_inventory set is_equipped = item_id is not distinct from p_data->>'id'
      where user_id = p_user and kind = 'utility' and item_id = any(effect_ids);
  elsif p_action = 'open_crate' then
    selected_crate := p_data->>'crate'; quantity := (p_data->>'quantity')::integer;
    crate_rule:=rules->'crates'->selected_crate;
    cost:=case quantity when 1 then (crate_rule->>'single')::integer
      when (crate_rule->>'quantity')::integer then (crate_rule->>'batch')::integer end;
    purple_pity:=(crate_rule->>'purple')::integer;
    gold_pity:=nullif((crate_rule->>'gold')::integer,0);
    if cost is null then raise exception 'invalid_action'; end if;
    if (select count(distinct s.tier) from public.shop_skins s where selected_crate = any(s.crates)) <
      jsonb_array_length(crate_rule->'bands') then raise exception 'catalog_unavailable'; end if;
    perform public.shop_change_balance(p_user,crate_rule->>'currency',-cost,'open_crate',p_reference);
    insert into public.shop_crate_progress(user_id,crate) values(p_user,selected_crate) on conflict do nothing;
    select * into strict crate_progress from public.shop_crate_progress cp where cp.user_id = p_user and cp.crate = selected_crate;
    for draw in 1..quantity loop
      roll := public.shop_roll();
      selected_tier := public.shop_band(crate_rule->'bands',roll);
      if crate_progress.gold_misses+1 >= gold_pity then selected_tier := 'gold';
      elsif selected_tier not in ('gold','purple') and crate_progress.purple_misses+1 >= purple_pity then selected_tier := 'purple';
      end if;
      result := result || jsonb_build_array(public.shop_pick_skin(p_user,selected_tier,selected_crate,null,p_reference));
      crate_progress.purple_misses := case when selected_tier in ('gold','purple') then 0 else crate_progress.purple_misses+1 end;
      crate_progress.gold_misses := case when gold_pity is null or selected_tier = 'gold' then 0 else crate_progress.gold_misses+1 end;
    end loop;
    update public.shop_crate_progress cp set purple_misses = crate_progress.purple_misses, gold_misses = crate_progress.gold_misses
      where cp.user_id = p_user and cp.crate = selected_crate;
  elsif p_action = 'spin' then
    if not season_valid or p_data->>'season' is distinct from season.id then raise exception 'season_unavailable'; end if;
    if 30 = any(progress.claimed_milestones) then raise exception 'season_complete'; end if;
    wheel:=rules->'wheel';
    quantity:=coalesce((p_data->>'quantity')::integer,1);
    if not wheel->'batches' @> jsonb_build_array(quantity) then raise exception 'invalid_action'; end if;
    per_spin:=(wheel->>'single')::integer;
    progress.spin_count:=coalesce(progress.spin_count,0);
    progress.claimed_milestones:=coalesce(progress.claimed_milestones,'{}');
    quantity:=least(quantity,30-progress.spin_count);
    if wallet.zenith_balance < quantity*per_spin then raise exception 'insufficient_balance'; end if;
    for draw in 1..quantity loop
      perform public.shop_change_balance(p_user,'ZN',-per_spin,'season_spin',p_reference);
      progress.spin_count:=progress.spin_count+1;
      if progress.spin_count=30 then selected_tier:='red';
      elsif progress.spin_count=20 and not 20=any(progress.claimed_milestones) then selected_tier:='gold';
      else selected_tier:=public.shop_band(wheel->'bands',public.shop_roll()); end if;

      if selected_tier in ('cb100','cb200') then
        drop_data:=public.shop_change_balance(p_user,'CB',substring(selected_tier from 3)::integer,'season_spin_prize',p_reference);
      else
        drop_data:=public.shop_pick_skin(p_user,selected_tier,null,season.id,p_reference,false);
      end if;
      result:=result || jsonb_build_array(drop_data);
      foreach milestone in array array[5,10,15,20,30] loop
        if milestone=any(progress.claimed_milestones)
          or (progress.spin_count<milestone and selected_tier<>'red' and not (milestone=20 and selected_tier='gold'))
          then continue; end if;
        case milestone
          when 5 then drop_data:=public.shop_change_balance(p_user,'CB',(wheel->'milestoneCB'->>'5')::integer,'season_milestone',p_reference);
          when 10 then drop_data:=public.shop_pick_skin(p_user,'purple',null,season.id,p_reference,true);
          when 15 then
            insert into public.user_inventory(user_id,kind,item_id) values(p_user,'utility',season.sound_pack_id) on conflict do nothing;
            drop_data:=public.shop_change_balance(p_user,'CB',(wheel->'milestoneCB'->>'15')::integer,'season_milestone',p_reference)
              || jsonb_build_object('utility',season.sound_pack_id);
          when 20 then
            drop_data:=case when selected_tier='gold' then '{}'::jsonb
              else public.shop_pick_skin(p_user,'gold',null,season.id,p_reference,true) end;
          when 30 then drop_data:='{}';
        end case;
        progress.claimed_milestones:=array_append(progress.claimed_milestones,milestone);
        result:=result || jsonb_build_array(drop_data || jsonb_build_object('milestone',milestone));
      end loop;
      exit when selected_tier='red';
    end loop;
    insert into public.season_gacha_progress(user_id,season_id,spin_count,claimed_milestones)
      values(p_user,season.id,progress.spin_count,progress.claimed_milestones)
      on conflict(user_id,season_id) do update set spin_count = excluded.spin_count, claimed_milestones = excluded.claimed_milestones;
  elsif p_action <> 'get' then raise exception 'invalid_action';
  end if;

  if p_action <> 'get' and receipt.request_id is null then
    insert into public.shop_receipts(user_id,request_id,action,data,result) values(p_user,p_reference,p_action,p_data,result);
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',owned.item_id,'kind',owned.kind,'equipped',owned.is_equipped,
    'expiresAt',owned.expires_at,'skin',to_jsonb(skin)) order by owned.kind,owned.item_id),'[]')
    into inventory from public.user_inventory owned left join public.shop_skins skin on owned.kind = 'skin' and skin.id = owned.item_id
    where owned.user_id = p_user and (owned.expires_at is null or owned.expires_at > now());
  select jsonb_object_agg(c.id,jsonb_build_object('enabled',
    (select count(distinct s.tier) from public.shop_skins s where c.id = any(s.crates)) >= c.tiers,
    'purpleMisses',coalesce(cp.purple_misses,0),'goldMisses',coalesce(cp.gold_misses,0)))
    into crate_catalog from (values ('core',3),('maglev',4),('quantum',3)) c(id,tiers)
    left join public.shop_crate_progress cp on cp.user_id = p_user and cp.crate = c.id;
  select * into strict wallet from public.user_wallets where user_id = p_user;
  return jsonb_build_object('cb',wallet.cubit_balance,'zn',wallet.zenith_balance,
    'catalog',rules,'offers',day_shop.offers,'rerolls',day_shop.rerolls,'inventory',inventory,'result',result,'crates',crate_catalog,
    'season',case when season_valid then jsonb_build_object('id',season.id,'name',season.name,'endsAt',season.ends_at,
      'spins',coalesce(progress.spin_count,0),'milestones',coalesce(progress.claimed_milestones,'{}')) end);
end;
$$;

-- Keep older deployed wardrobe clients on the same inventory as the shop.
create or replace function public.skin_inventory(p_user uuid,p_equip boolean,p_skin text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare equipped text; catalogue jsonb;
begin
  perform public.economy_lock_wallet(p_user);
  if p_equip then
    if p_skin is not null and not exists(select 1 from public.shop_skins
      where id=p_skin and tier='white' and season_id is null) then raise exception 'skin_not_owned'; end if;
    if p_skin is not null and not exists(select 1 from public.user_inventory
      where user_id=p_user and kind='skin' and item_id=p_skin) then raise exception 'skin_not_owned'; end if;
    perform public.skin_shop_action(p_user,'equip_skin',jsonb_build_object('id',p_skin),gen_random_uuid());
  end if;
  select item_id into equipped from public.user_inventory
    where user_id=p_user and kind='skin' and is_equipped;
  select coalesce(jsonb_agg(jsonb_build_object('id',skin.id,'name',skin.name,
    'colors',array(select ('x'||substring(skin.appearance->'layers'->'layer_1_base'->'face_colors'->>face from 2))::bit(24)::integer
      from unnest(array['U','R','F','D','L','B']) with ordinality faces(face,ord) order by ord),
    'owned',owned.item_id is not null) order by skin.id),'[]') into catalogue
    from public.shop_skins skin left join public.user_inventory owned
      on owned.user_id=p_user and owned.kind='skin' and owned.item_id=skin.id
    where skin.tier='white' and skin.season_id is null;
  return jsonb_build_object('equipped',equipped,'skins',catalogue);
end;
$$;
revoke all on function public.skin_inventory(uuid,boolean,text) from public,anon,authenticated;
grant execute on function public.skin_inventory(uuid,boolean,text) to service_role;

revoke all on function public.shop_change_balance(uuid,text,integer,text,uuid),
  public.shop_charge_rename(), public.shop_nameplate(uuid), public.leaderboard_with_nameplates(integer),
  public.lobby_action_with_nameplates(uuid,text,text,jsonb), public.shop_skin_appearance(text),
  public.shop_make_offers(uuid,date,uuid,integer,jsonb), public.shop_pick_skin(uuid,text,text,text,uuid,boolean),
  public.shop_catalog(), public.shop_band(jsonb,integer), public.shop_utility_catalog(), public.shop_roll(), public.skin_shop_action(uuid,text,jsonb,uuid) from public, anon, authenticated;
grant execute on function public.shop_change_balance(uuid,text,integer,text,uuid),
  public.shop_charge_rename(), public.shop_nameplate(uuid), public.leaderboard_with_nameplates(integer),
  public.lobby_action_with_nameplates(uuid,text,text,jsonb), public.shop_skin_appearance(text),
  public.shop_make_offers(uuid,date,uuid,integer,jsonb), public.shop_pick_skin(uuid,text,text,text,uuid,boolean),
  public.shop_catalog(), public.shop_band(jsonb,integer), public.shop_utility_catalog(), public.shop_roll(), public.skin_shop_action(uuid,text,jsonb,uuid) to service_role;

commit;
