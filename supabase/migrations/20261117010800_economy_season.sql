begin;

create table public.shop_seasons (
  id text primary key,
  name text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null check (ends_at > starts_at),
  legacy_shop_unlock_at timestamptz not null check (legacy_shop_unlock_at > ends_at),
  sound_pack_id text not null,
  exclude using gist (tstzrange(starts_at,ends_at,'[)') with &&)
);
insert into public.shop_seasons values ('season_01','Kỷ Nguyên Từ Trường & Lượng Tử',
  '2026-11-18T00:00:00+07:00','2026-12-08T23:59:59+07:00','2027-01-07T00:00:00+07:00','sound_maglev_quantum_s1');

create table public.economy_closed_seasons (
  season_id text primary key references public.shop_seasons(id),
  reference_id uuid not null unique default gen_random_uuid(),
  cut_off timestamptz not null,
  closed_at timestamptz not null default clock_timestamp(),
  wallets integer not null default 0,
  refunds integer not null default 0
);
alter table public.shop_seasons enable row level security;
alter table public.economy_closed_seasons enable row level security;
revoke all on public.shop_seasons,public.economy_closed_seasons from public,anon,authenticated;
grant select,insert,update,delete on public.shop_seasons,public.economy_closed_seasons to service_role;

create or replace function public.economy_lock_wallet(p_user uuid)
returns public.user_wallets language plpgsql security invoker set search_path = '' as $$
declare wallet public.user_wallets;
begin
  perform pg_advisory_xact_lock_shared(584027,2);
  if not exists(select 1 from public.profiles where id=p_user) then raise exception 'profile_required'; end if;
  if current_setting('rubik.economy_maintenance',true) is distinct from 'on' and exists(
    select 1 from public.shop_seasons season where season.ends_at<=statement_timestamp()
      and not exists(select 1 from public.economy_closed_seasons closed where closed.season_id=season.id)
  ) then raise exception 'season_reset_pending'; end if;
  insert into public.user_wallets(user_id) values(p_user) on conflict do nothing;
  select * into strict wallet from public.user_wallets where user_id=p_user for update;
  return wallet;
end;
$$;

create or replace function public.time_limit_with_quests(p_user uuid,p_id text,p_action text,p_payload jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare snapshot jsonb; stamp bigint; ticket public.economy_time_limit_tickets; payout public.economy_time_limit_payouts;
begin
  perform pg_advisory_xact_lock_shared(584027,2);
  snapshot:=public.time_limit_action(p_user,p_id,p_action,p_payload);
  stamp:=(snapshot->>'now_ms')::bigint;
  ticket:=public.economy_time_limit_ticket(p_user,p_id,stamp);
  payout:=public.economy_time_limit_settle(p_user,p_id,stamp);
  perform public.economy_record_time_limit_quest(p_user,p_id);
  return snapshot || jsonb_build_object('economy',jsonb_build_object(
    'ticket',ticket.kind,'fee',ticket.fee,
    'reward',case when payout.session_id is not null then jsonb_build_object('cb',payout.cb,'zn',payout.zn) end
  ));
end;
$$;

create function public.economy_close_time_limits(p_cutoff timestamptz)
returns integer language plpgsql security invoker set search_path = '' as $$
declare candidate record; payout public.economy_time_limit_payouts; done integer:=0;
  stamp bigint:=floor(extract(epoch from p_cutoff)*1000)::bigint;
begin
  for candidate in
    select session.id,session.user_id from public.time_limit_sessions session
    where session.economy_tracked and session.mode='fullSolve' and not session.abandoned
      and session.start_ms+201000<=stamp
      and not exists(select 1 from public.economy_time_limit_finished marker where marker.session_id=session.id)
    order by session.start_ms,session.id
  loop
    payout:=public.economy_time_limit_settle(candidate.user_id,candidate.id,stamp);
    perform public.economy_record_time_limit_quest(candidate.user_id,candidate.id);
    if payout.session_id is not null then done:=done+1; end if;
  end loop;
  return done;
end;
$$;

create function public.economy_close_weeks_through(p_cutoff timestamptz)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare previous_week date; payouts integer:=0; weeks integer:=0;
begin
  for previous_week in
    select distinct public.economy_week(verified.completed_at) from public.practice_challenges verified
    where verified.eligible and verified.size between 2 and 5
      and verified.completed_at<public.economy_week(p_cutoff)::timestamp at time zone 'Asia/Ho_Chi_Minh'
      and not exists(select 1 from public.economy_closed_weeks closed
        where closed.week_start=public.economy_week(verified.completed_at))
    order by 1
  loop
    payouts:=payouts+public.economy_close_week(previous_week);
    weeks:=weeks+1;
  end loop;
  return jsonb_build_object('weeks',weeks,'weeklyAwards',payouts);
end;
$$;

create function public.economy_close_season(p_id text)
returns public.economy_closed_seasons language plpgsql security invoker set search_path = '' as $$
declare
  season public.shop_seasons; receipt public.economy_closed_seasons; pending record; wallet record;
  ref uuid; affected integer:=0; refunded integer:=0; prior_setting text;
begin
  perform pg_advisory_xact_lock(584027,2);
  select * into receipt from public.economy_closed_seasons where season_id=p_id;
  if found then return receipt; end if;
  select * into season from public.shop_seasons where id=p_id;
  if not found or season.ends_at>statement_timestamp() then raise exception 'season_not_closed'; end if;
  if exists(select 1 from public.shop_seasons older where older.ends_at<season.ends_at
    and not exists(select 1 from public.economy_closed_seasons closed where closed.season_id=older.id))
    then raise exception 'older_season_pending'; end if;
  prior_setting:=current_setting('rubik.economy_maintenance',true);
  perform set_config('rubik.economy_maintenance','on',true);
  perform public.economy_close_time_limits(season.ends_at);
  perform public.economy_close_weeks_through(season.ends_at);

  for pending in select round_id from public.economy_race_escrow
    where state='locked' and to_timestamp(start_ms/1000.0)<season.ends_at order by round_id
  loop
    perform public.economy_settle_race(pending.round_id,floor(extract(epoch from season.ends_at)*1000)::bigint,true);
    refunded:=refunded+1;
  end loop;
  ref:=gen_random_uuid();
  for wallet in select * from public.user_wallets order by user_id
  loop
    perform public.economy_change_balance(wallet.user_id,'CB',wallet.cubit_balance/2-wallet.cubit_balance,'season_reset',ref);
    perform public.economy_change_balance(wallet.user_id,'ZN',-wallet.zenith_balance,'season_reset',ref);
    affected:=affected+1;
  end loop;
  insert into public.economy_closed_seasons(season_id,reference_id,cut_off,wallets,refunds)
    values(p_id,ref,season.ends_at,affected,refunded) returning * into receipt;
  perform set_config('rubik.economy_maintenance',coalesce(prior_setting,''),true);
  return receipt;
end;
$$;

create or replace function public.economy_maintain()
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare cutoff timestamptz:=statement_timestamp(); candidate record; seasons integer:=0; refunds integer:=0;
  receipt public.economy_closed_seasons; prior_setting text;
begin
  perform pg_advisory_xact_lock(584027,2);
  prior_setting:=current_setting('rubik.economy_maintenance',true);
  perform set_config('rubik.economy_maintenance','on',true);
  for candidate in select season.id from public.shop_seasons season
    where season.ends_at<=cutoff and not exists(select 1 from public.economy_closed_seasons closed where closed.season_id=season.id)
    order by season.ends_at
  loop
    receipt:=public.economy_close_season(candidate.id);
    refunds:=refunds+receipt.refunds;
    seasons:=seasons+1;
  end loop;
  refunds:=refunds+public.economy_sweep_race_escrows();
  perform public.economy_close_time_limits(cutoff);
  perform set_config('rubik.economy_maintenance',coalesce(prior_setting,''),true);
  return public.economy_close_weeks_through(cutoff)||jsonb_build_object('escrows',refunds,'seasons',seasons);
end;
$$;

drop function public.economy_maintain_weekly();

revoke all on function public.economy_close_time_limits(timestamptz),public.economy_close_weeks_through(timestamptz),
  public.economy_close_season(text) from public,anon,authenticated;
grant execute on function public.economy_close_time_limits(timestamptz),public.economy_close_weeks_through(timestamptz),
  public.economy_close_season(text) to service_role;
commit;
