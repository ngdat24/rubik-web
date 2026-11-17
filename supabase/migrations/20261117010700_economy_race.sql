begin;

create table public.economy_race_wagers (
  room_id text primary key references public.race_lobbies(id) on delete cascade,
  stake integer not null check (stake in (100,200,300,500))
);
create table public.economy_race_escrow (
  round_id text primary key,
  room_id text not null,
  player_a uuid not null,
  player_b uuid not null check (player_b<>player_a),
  start_ms bigint not null,
  stake integer not null check (stake in (100,200,300,500)),
  state text not null default 'locked' check (state in ('locked','settled','refunded')),
  result text,
  winner uuid,
  burned_cb integer not null default 0,
  finished_at timestamptz
);
create index economy_race_escrow_pending on public.economy_race_escrow(room_id) where state='locked';
create index economy_race_pair_results on public.economy_race_escrow(least(player_a,player_b),greatest(player_a,player_b),finished_at);
create table public.economy_race_moves (
  round_id text references public.economy_race_escrow(round_id) on delete cascade,
  user_id uuid,
  cube_index integer,
  cost integer not null check (cost between 0 and 8000),
  primary key (round_id,user_id,cube_index)
);
create table public.economy_race_streaks (
  user_id uuid primary key references public.user_wallets(user_id) on delete cascade,
  wins integer not null check (wins between 0 and 4)
);

do $$
declare name text;
begin
  foreach name in array array['economy_race_wagers','economy_race_escrow','economy_race_moves','economy_race_streaks'] loop
    execute format('alter table public.%I enable row level security',name);
    execute format('revoke all on public.%I from public,anon,authenticated',name);
    execute format('grant select,insert,update,delete on public.%I to service_role',name);
  end loop;
end;
$$;

create function public.economy_lock_race(p_room public.race_lobbies,p_stake integer)
returns void language plpgsql security invoker set search_path = '' as $$
declare a uuid; b uuid;
begin
  if p_stake=0 or p_room.start_ms is null or jsonb_array_length(p_room.players)<>2
    or exists(select 1 from public.economy_race_escrow where round_id=p_room.round_id) then return; end if;
  a:=(p_room.players->0->>'id')::uuid;
  b:=(p_room.players->1->>'id')::uuid;
  perform public.economy_lock_wallet(least(a,b));
  perform public.economy_lock_wallet(greatest(a,b));
  perform public.economy_change_balance(a,'CB',-p_stake,'race_stake',p_room.round_id::uuid);
  perform public.economy_change_balance(b,'CB',-p_stake,'race_stake',p_room.round_id::uuid);
  insert into public.economy_race_escrow(round_id,room_id,player_a,player_b,start_ms,stake)
    values(p_room.round_id,p_room.id,a,b,p_room.start_ms,p_stake);
end;
$$;

create function public.economy_race_bonus(p_match public.economy_race_escrow,p_winner uuid,p_day date)
returns void language plpgsql security invoker set search_path = '' as $$
declare pair_count integer; wins_now integer; bonus integer:=0; paid bigint;
begin
  if p_winner is null then
    delete from public.economy_race_streaks where user_id in (p_match.player_a,p_match.player_b);
    return;
  end if;
  delete from public.economy_race_streaks where user_id in (p_match.player_a,p_match.player_b) and user_id<>p_winner;
  select count(*) into pair_count from public.economy_race_escrow history
    where least(history.player_a,history.player_b)=least(p_match.player_a,p_match.player_b)
      and greatest(history.player_a,history.player_b)=greatest(p_match.player_a,p_match.player_b)
      and history.result in ('win','forfeit','draw')
      and history.finished_at>=p_day::timestamp at time zone 'Asia/Ho_Chi_Minh'
      and history.finished_at<(p_day+1)::timestamp at time zone 'Asia/Ho_Chi_Minh';
  if pair_count>3 then return; end if;
  select wins into wins_now from public.economy_race_streaks where user_id=p_winner;
  wins_now:=coalesce(wins_now,0)+1;
  if wins_now=3 then bonus:=50;
  elsif wins_now=5 and p_match.stake>=200 then bonus:=150; end if;
  insert into public.economy_race_streaks(user_id,wins)
    values(p_winner,wins_now%5) on conflict(user_id) do update set wins=excluded.wins;
  if bonus>0 then
    select coalesce(sum(amount),0) into paid from public.currency_ledger
      where user_id=p_winner and reason='race_streak' and created_at>=p_day::timestamp at time zone 'Asia/Ho_Chi_Minh'
        and created_at<(p_day+1)::timestamp at time zone 'Asia/Ho_Chi_Minh';
    perform public.economy_change_balance(p_winner,'CB',least(bonus,greatest(200-paid,0)),'race_streak',p_match.round_id::uuid);
  end if;
end;
$$;

create function public.economy_settle_race(p_round text,p_now_ms bigint,p_cancel boolean default false)
returns public.economy_race_escrow language plpgsql security invoker set search_path = '' as $$
declare
  wager public.economy_race_escrow; room public.race_lobbies;
  a jsonb; b jsonb; a_left boolean; b_left boolean; left_before_play boolean;
  a_score integer; b_score integer; a_end integer; b_end integer; a_moves integer; b_moves integer;
  winner_id uuid; outcome text; settled_at timestamptz:=to_timestamp(p_now_ms/1000.0);
begin
  select * into wager from public.economy_race_escrow where round_id=p_round for update;
  if not found or wager.state<>'locked' then return wager; end if;
  select * into room from public.race_lobbies where id=wager.room_id and round_id=p_round;
  if not found or p_cancel then outcome:='cancelled';
  else
    select player into a from jsonb_array_elements(room.players) player where player->>'id'=wager.player_a::text;
    select player into b from jsonb_array_elements(room.players) player where player->>'id'=wager.player_b::text;
    a_left:=a is null or room.forfeit=wager.player_a or
      (not coalesce((a->>'present')::boolean,false) and p_now_ms<wager.start_ms+201000) or
      ((a->>'until')::bigint<=p_now_ms and (a->>'until')::bigint<wager.start_ms+201000);
    b_left:=b is null or room.forfeit=wager.player_b or
      (not coalesce((b->>'present')::boolean,false) and p_now_ms<wager.start_ms+201000) or
      ((b->>'until')::bigint<=p_now_ms and (b->>'until')::bigint<wager.start_ms+201000);
    a_left:=coalesce(a_left,false);
    b_left:=coalesce(b_left,false);
    a_score:=coalesce(jsonb_array_length(a->'runs'),0);
    b_score:=coalesce(jsonb_array_length(b->'runs'),0);
    if a_left or b_left then
      left_before_play:=p_now_ms<wager.start_ms+18000
        or (a_left and (a->>'until')::bigint<wager.start_ms+18000)
        or (b_left and (b->>'until')::bigint<wager.start_ms+18000);
      if left_before_play or (a_left and b_left) then outcome:='cancelled';
      elsif a_left and b_score>0 then outcome:='forfeit'; winner_id:=wager.player_b;
      elsif b_left and a_score>0 then outcome:='forfeit'; winner_id:=wager.player_a;
      else outcome:='draw';
      end if;
    elsif p_now_ms<wager.start_ms+201000 then return wager;
    else
      a_end:=coalesce((a->'runs'->-1->>'endT')::integer,0);
      b_end:=coalesce((b->'runs'->-1->>'endT')::integer,0);
      select coalesce(sum(cost) filter(where user_id=wager.player_a),0),
             coalesce(sum(cost) filter(where user_id=wager.player_b),0)
        into a_moves,b_moves from public.economy_race_moves where round_id=p_round;
      if (-a_score,a_end,a_moves)<(-b_score,b_end,b_moves) then winner_id:=wager.player_a;
      elsif (-b_score,b_end,b_moves)<(-a_score,a_end,a_moves) then winner_id:=wager.player_b; end if;
      outcome:=case when winner_id is null then 'draw' else 'win' end;
    end if;
  end if;

  perform public.economy_lock_wallet(least(wager.player_a,wager.player_b));
  perform public.economy_lock_wallet(greatest(wager.player_a,wager.player_b));
  if winner_id is null then
    perform public.economy_change_balance(wager.player_a,'CB',wager.stake,'race_refund',p_round::uuid,true);
    perform public.economy_change_balance(wager.player_b,'CB',wager.stake,'race_refund',p_round::uuid,true);
    update public.economy_race_escrow set state='refunded',result=outcome,finished_at=settled_at
      where round_id=p_round returning * into wager;
  else
    perform public.economy_change_balance(winner_id,'CB',wager.stake*18/10,'race_winnings',p_round::uuid,true);
    update public.economy_race_escrow set state='settled',winner=winner_id,result=outcome,
      burned_cb=wager.stake*2/10,finished_at=settled_at where round_id=p_round returning * into wager;
  end if;
  if outcome in ('win','draw','forfeit') then
    perform public.economy_race_bonus(wager,winner_id,public.economy_day(settled_at));
  end if;
  return wager;
end;
$$;

create function public.lobby_action_with_escrow(p_user uuid,p_code text,p_action text,p_payload jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare before_room public.race_lobbies; after_room public.race_lobbies; result jsonb;
  stake_amount integer; stamp bigint; escrow public.economy_race_escrow;
begin
  perform pg_advisory_xact_lock_shared(584027,2);
  stamp:=floor(extract(epoch from clock_timestamp())*1000)::bigint;
  select * into before_room from public.race_lobbies where id=p_code for update;
  select coalesce((select stake from public.economy_race_wagers where room_id=p_code),0) into stake_amount;
  if p_action='stake' then
    if before_room.owner_id is distinct from p_user
      or before_room.players->0->>'client' is distinct from p_payload->>'client'
      or before_room.round_id is distinct from p_payload->>'round'
      or before_room.start_ms is not null and before_room.start_ms+201000>stamp and before_room.forfeit is null
      or coalesce(p_payload->>'stake','') not in ('0','100','200','300','500')
      then raise exception 'Invalid wager change'; end if;
    if stake_amount<>(p_payload->>'stake')::integer then
      stake_amount:=(p_payload->>'stake')::integer;
      if stake_amount=0 then delete from public.economy_race_wagers where room_id=p_code;
      else insert into public.economy_race_wagers(room_id,stake) values(p_code,stake_amount)
        on conflict(room_id) do update set stake=excluded.stake;
      end if;
      update public.race_lobbies set players=(
        select jsonb_agg(e||'{"ready":false,"rematch":false}'::jsonb order by ord)
          from jsonb_array_elements(before_room.players) with ordinality entries(e,ord)
      ) where id=p_code;
    end if;
    p_action:='get';
  end if;
  if p_action in ('ready','rematch') and stake_amount is distinct from coalesce((p_payload->>'stake')::integer,0)
    then raise exception 'Wager changed'; end if;
  if before_room.round_id is not null and p_action in ('join','rematch','mode')
    then perform public.economy_settle_race(before_room.round_id,stamp); end if;
  result:=public.lobby_action(p_user,p_code,p_action,p_payload);
  stamp:=(result->>'now_ms')::bigint;
  if coalesce((result->>'gone')::boolean,false) then
    if before_room.round_id is not null then perform public.economy_settle_race(before_room.round_id,stamp); end if;
    return result;
  end if;
  select * into strict after_room from public.race_lobbies where id=p_code;
  if p_action in ('ready','rematch') then perform public.economy_lock_race(after_room,stake_amount); end if;
  if p_action='cube_done' and exists(select 1 from public.economy_race_escrow
    where round_id=after_room.round_id and state='locked') then
    insert into public.economy_race_moves(round_id,user_id,cube_index,cost)
      values(after_room.round_id,p_user,(p_payload->'run'->>'k')::integer,(p_payload->>'moveCost')::integer)
      on conflict do nothing;
  end if;
  escrow:=public.economy_settle_race(after_room.round_id,stamp);
  return result || jsonb_build_object('stake',stake_amount,'escrow',case when escrow.round_id is not null
    then jsonb_build_object('state',escrow.state,'winner',escrow.winner,'burnedCb',escrow.burned_cb,'stake',escrow.stake) end);
end;
$$;

create function public.economy_refund_account_escrow()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare wager record;
begin
  perform pg_advisory_xact_lock_shared(584027,2);
  for wager in select round_id from public.economy_race_escrow
    where state='locked' and old.id in (player_a,player_b) order by round_id
  loop
    perform public.economy_settle_race(wager.round_id,floor(extract(epoch from clock_timestamp())*1000)::bigint,true);
  end loop;
  return old;
end;
$$;
create trigger economy_before_profile_delete before delete on public.profiles
  for each row execute function public.economy_refund_account_escrow();

revoke all on function public.economy_lock_race(public.race_lobbies,integer),
  public.economy_race_bonus(public.economy_race_escrow,uuid,date),public.economy_settle_race(text,bigint,boolean),
  public.lobby_action_with_escrow(uuid,text,text,jsonb),public.economy_refund_account_escrow() from public,anon,authenticated;
grant execute on function public.economy_lock_race(public.race_lobbies,integer),
  public.economy_race_bonus(public.economy_race_escrow,uuid,date),public.economy_settle_race(text,bigint,boolean),
  public.lobby_action_with_escrow(uuid,text,text,jsonb),public.economy_refund_account_escrow() to service_role;

alter function public.economy_maintain() rename to economy_maintain_weekly;

create function public.economy_sweep_race_escrows()
returns integer language plpgsql security invoker set search_path = '' as $$
declare pending record; resolved public.economy_race_escrow;
  stamp bigint:=floor(extract(epoch from clock_timestamp())*1000)::bigint; count_done integer:=0;
begin
  perform pg_advisory_xact_lock(584027,2);
  for pending in
    select escrow.round_id from public.economy_race_escrow escrow
      left join public.race_lobbies room on room.id=escrow.room_id and room.round_id=escrow.round_id
    where escrow.state='locked' and (room.id is null or room.forfeit is not null or room.expires_ms<=stamp
      or escrow.start_ms+201000<=stamp)
    order by escrow.round_id
  loop
    resolved:=public.economy_settle_race(pending.round_id,stamp);
    if resolved.state<>'locked' then count_done:=count_done+1; end if;
  end loop;
  return count_done;
end;
$$;

create function public.economy_maintain()
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare race_count integer;
begin
  race_count:=public.economy_sweep_race_escrows();
  return public.economy_maintain_weekly() || jsonb_build_object('escrows',race_count);
end;
$$;

revoke all on function public.economy_sweep_race_escrows(),public.economy_maintain() from public,anon,authenticated;
grant execute on function public.economy_sweep_race_escrows(),public.economy_maintain() to service_role;

commit;
