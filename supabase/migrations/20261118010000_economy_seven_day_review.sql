begin;

-- Keep past payouts and completed quest bits. Apply the new rules to new awards.
alter table public.economy_time_limit_tickets add column reward_eligible boolean not null default false;
with ranked as (
  select ticket.session_id,row_number() over(partition by ticket.user_id,ticket.ticket_day order by session.start_ms,session.id) slot
  from public.economy_time_limit_tickets ticket join public.time_limit_sessions session on session.id=ticket.session_id
  where ticket.kind in ('free_ticket','paid_ticket')
)
update public.economy_time_limit_tickets ticket set reward_eligible=ranked.slot<=3
  from ranked where ticket.session_id=ranked.session_id;

-- A previously paid streak must not become claimable again after rollout.
insert into public.economy_receipts(user_id,kind,request_id,payload,result)
select distinct on (user_id,public.economy_day(created_at),amount)
  user_id,'race_streak_milestone',
  public.economy_day(created_at)::text||'/'||case when amount<=50 then '3' else '5' end,
  jsonb_build_object('migrated',true),jsonb_build_object('nominal',case when amount<=50 then 50 else 150 end)
from public.currency_ledger where reason='race_streak' and amount>0
order by user_id,public.economy_day(created_at),amount,id
on conflict do nothing;


create or replace function public.economy_quest_counts(p_user uuid,p_day date)
returns integer[] language sql stable set search_path = '' as $$
  select array[count(*) filter(where size=2),count(*) filter(where size=3),
    count(*) filter(where size=4),count(*) filter(where size>=5)]::integer[]
  from public.economy_quest_solves where user_id=p_user and quest_day=p_day
$$;


create or replace function public.economy_refresh_quests(p_user uuid,p_day date,p_reference uuid default null)
returns void language plpgsql security invoker set search_path = '' as $$
declare counts integer[]; progress public.economy_daily_quests; achieved integer:=0; new_tasks integer;
begin
  perform public.economy_lock_wallet(p_user);
  counts:=public.economy_quest_counts(p_user,p_day);
  if counts[1]>=10 or counts[2]>=5 or counts[3]>=3 or counts[4]>=1 then achieved:=achieved|1; end if;
  if exists(select 1 from public.economy_time_limit_finished where user_id=p_user and quest_day=p_day)
    or exists(select 1 from public.time_limit_sessions
      where user_id=p_user and economy_tracked and not abandoned
        and start_ms+201000<=floor(extract(epoch from clock_timestamp())*1000)::bigint
        and public.economy_day(to_timestamp((start_ms+198000)/1000.0))=p_day)
    then achieved:=achieved|2; end if;
  if exists(select 1 from public.economy_quest_presence where user_id=p_user and quest_day=p_day and active_ms=600000)
    then achieved:=achieved|4; end if;
  if achieved=0 then return; end if;
  insert into public.economy_daily_quests(user_id,quest_day) values(p_user,p_day) on conflict do nothing;
  select * into strict progress from public.economy_daily_quests where user_id=p_user and quest_day=p_day;
  achieved:=achieved | progress.completed_mask;
  new_tasks:=achieved & ~progress.completed_mask;
  if new_tasks=0 then return; end if;

  if (new_tasks&1)=1 then perform public.economy_change_balance(p_user,'CB',50,'quest_practice',p_reference); end if;
  if (new_tasks&2)=2 then perform public.economy_change_balance(p_user,'CB',50,'quest_time_limit',p_reference); end if;
  if (new_tasks&4)=4 then perform public.economy_change_balance(p_user,'CB',100,'quest_online',p_reference); end if;
  update public.economy_daily_quests set completed_mask=achieved where user_id=p_user and quest_day=p_day;

  if achieved=7 then
    perform public.economy_change_balance(p_user,'ZN',2,'quest_daily_complete',p_reference);
    if public.economy_streak_days(p_user,p_day)=7 then
      perform public.economy_change_balance(p_user,'ZN',6,'quest_streak',p_reference);
      update public.economy_daily_quests set streak_awarded=true where user_id=p_user and quest_day=p_day;
    end if;
  end if;
end;
$$;

create or replace function public.economy_progress_snapshot(p_user uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare today date:=public.economy_day(clock_timestamp()); completed integer; streak integer; pbs jsonb;
begin
  if not exists(select 1 from public.profiles where id=p_user) then raise exception 'profile_required'; end if;
  select completed_mask into completed from public.economy_daily_quests where user_id=p_user and quest_day=today;
  streak:=public.economy_streak_days(p_user,case when completed=7 then today else today-1 end);
  if completed is distinct from 7 and streak=7 then streak:=0; end if;
  select coalesce(jsonb_agg(jsonb_build_object('size',size,'kind',stat,'timeMs',time_ms) order by size,stat),'[]')
    into pbs from public.economy_personal_bests where user_id=p_user;
  return jsonb_build_object('day',today,'completed',coalesce(completed,0),'streak',streak,
    'onlineSeconds',coalesce((select active_ms/1000 from public.economy_quest_presence where user_id=p_user and quest_day=today),0),
    'counts',public.economy_quest_counts(p_user,today),'pbs',pbs);
end;
$$;

create or replace function public.economy_quest_heartbeat(p_user uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare stamp timestamptz; day date;
begin
  perform public.economy_lock_wallet(p_user);
  stamp:=clock_timestamp();
  day:=public.economy_day(stamp);
  insert into public.economy_quest_presence as presence(user_id,quest_day,last_seen)
    values(p_user,day,stamp)
    on conflict(user_id,quest_day) do update set last_seen=excluded.last_seen,
      active_ms=least(600000,presence.active_ms+case
        when excluded.last_seen-presence.last_seen between interval '0 seconds' and interval '25 seconds'
        then floor(extract(epoch from excluded.last_seen-presence.last_seen)*1000)::integer else 0 end);
  perform public.economy_refresh_quests(p_user,day);
  return public.economy_progress_snapshot(p_user);
end;
$$;

create or replace function public.economy_time_limit_ticket(p_user uuid,p_id text,p_now_ms bigint)
returns public.economy_time_limit_tickets language plpgsql security invoker set search_path = '' as $$
declare
  session public.time_limit_sessions; ticket public.economy_time_limit_tickets;
  wallet public.user_wallets; billed_day date; quota integer; ticket_kind text; ticket_fee integer:=0;
begin
  select * into session from public.time_limit_sessions where user_id=p_user and id=p_id for update;
  if not found or not session.economy_tracked or session.mode<>'fullSolve' then return null; end if;
  select * into ticket from public.economy_time_limit_tickets where session_id=p_id;
  if found then return ticket; end if;
  -- A request before countdown ends never charges. A session that was
  -- abandoned or never reached a confirmed start remains a free practice.
  if session.abandoned or p_now_ms<session.start_ms+3000 or p_now_ms>=session.start_ms+201000 then return null; end if;
  wallet:=public.economy_lock_wallet(p_user);
  billed_day:=public.economy_day(to_timestamp((session.start_ms+3000)/1000.0));
  select count(*) into quota from public.economy_time_limit_tickets
    where user_id=p_user and ticket_day=billed_day and kind in ('free_ticket','paid_ticket');
  if quota=0 then ticket_kind:='free_ticket';
  elsif wallet.cubit_balance<100 then ticket_kind:='insufficient';
  else
    ticket_kind:='paid_ticket';
    ticket_fee:=100;
    perform public.economy_change_balance(p_user,'CB',-ticket_fee,'time_limit_ticket',p_id::uuid);
  end if;
  insert into public.economy_time_limit_tickets(session_id,user_id,ticket_day,kind,fee,reward_eligible)
    values(p_id,p_user,billed_day,ticket_kind,ticket_fee,quota<3 and ticket_kind in ('free_ticket','paid_ticket')) returning * into ticket;
  return ticket;
end;
$$;

create or replace function public.economy_time_limit_settle(p_user uuid,p_id text,p_now_ms bigint)
returns public.economy_time_limit_payouts language plpgsql security invoker set search_path = '' as $$
declare
  session public.time_limit_sessions; payout public.economy_time_limit_payouts;
  day_earned date; week_start date; day_zn integer; week_zn integer; day_attempts integer;
  nominal_cb integer; actual_cb integer; actual_zn integer:=0; change jsonb;
begin
  select * into session from public.time_limit_sessions where user_id=p_user and id=p_id for update;
  if not found or session.abandoned or session.mode<>'fullSolve' or not session.economy_tracked
    or p_now_ms<session.start_ms+201000 then return null; end if;
  if not exists(select 1 from public.economy_time_limit_tickets
    where session_id=p_id and user_id=p_user and kind in ('free_ticket','paid_ticket') and reward_eligible) then return null; end if;
  select * into payout from public.economy_time_limit_payouts where session_id=p_id;
  if found then return payout; end if;
  perform public.economy_lock_wallet(p_user);
  day_earned:=public.economy_day(to_timestamp((session.start_ms+198000)/1000.0));
  week_start:=date_trunc('week',day_earned::timestamp)::date;
  select coalesce(sum(zn) filter(where reward_day=day_earned),0),coalesce(sum(zn),0),
    count(*) filter(where reward_day=day_earned)
    into day_zn,week_zn,day_attempts from public.economy_time_limit_payouts
    where user_id=p_user and reward_day>=week_start and reward_day<week_start+7;
  nominal_cb:=case session.score when 0 then 0 when 1 then 75 when 2 then 145 else 205 end;
  if day_attempts>=3 then nominal_cb:=0; end if;
  change:=public.economy_change_balance(p_user,'CB',nominal_cb,'time_limit_reward',p_id::uuid);
  actual_cb:=(change->>'amount')::integer;
  if session.score>=2 and day_zn<3 and week_zn<10 and day_attempts<3 then
    change:=public.economy_change_balance(p_user,'ZN',1,'time_limit_reward',p_id::uuid);
    actual_zn:=(change->>'amount')::integer;
  end if;
  insert into public.economy_time_limit_payouts(session_id,user_id,reward_day,cb,zn)
    values(p_id,p_user,day_earned,actual_cb,actual_zn) returning * into payout;
  return payout;
end;
$$;

create or replace function public.economy_record_pb(p_challenge uuid)
returns void language plpgsql security invoker set search_path = '' as $$
declare
  challenge public.practice_challenges; recent bigint[]; values_window bigint[];
  kind text; needed integer; score bigint; old_score bigint; today date; week_start date;
  prior_count integer; cb_count integer; zn_count integer; today_cb integer; cb integer; zn integer;
  changes jsonb;
begin
  select * into strict challenge from public.practice_challenges where id=p_challenge;
  if not public.economy_solo_eligible(challenge) then return; end if;
  perform public.economy_lock_wallet(challenge.user_id);
  select array_agg(effective_ms order by completed_at desc,id desc) into recent from (
    select effective_ms,completed_at,id from public.practice_challenges
    where user_id=challenge.user_id and size=challenge.size and public.economy_solo_eligible(practice_challenges)
    order by completed_at desc,id desc limit 12
  ) last_solves;
  prior_count:=cardinality(recent)-1;
  today:=public.economy_day(challenge.completed_at);
  week_start:=date_trunc('week',today::timestamp)::date;
  select count(*) filter(where rewards.cb>0),count(*) filter(where rewards.zn>0),coalesce(sum(rewards.cb) filter(where rewards.reward_day=today),0)
    into cb_count,zn_count,today_cb from public.economy_pb_rewards rewards
    where user_id=challenge.user_id and reward_day>=week_start and reward_day<week_start+7;

  foreach kind in array array['single','mo3','ao5','ao12'] loop
    needed:=case kind when 'single' then 1 when 'mo3' then 3 when 'ao5' then 5 else 12 end;
    if cardinality(recent)<needed then continue; end if;
    if kind='single' then score:=challenge.effective_ms;
    elsif kind='mo3' then
      select round(avg(ms))::bigint into score from unnest(recent[1:3]) ms;
    else
      values_window:=recent[1:needed];
      select round((sum(ms)-min(ms)-max(ms))::numeric/(needed-2))::bigint into score from unnest(values_window) ms;
    end if;
    select time_ms into old_score from public.economy_personal_bests
      where user_id=challenge.user_id and size=challenge.size and stat=kind;
    if old_score is not null and score>=old_score then continue; end if;
    insert into public.economy_personal_bests(user_id,size,stat,time_ms)
      values(challenge.user_id,challenge.size,kind,score)
      on conflict(user_id,size,stat) do update set time_ms=excluded.time_ms;
    if old_score is null or prior_count<10 or (cb_count>=5 and zn_count>=5)
      or old_score-score<greatest(ceil(old_score*0.02),200) then continue; end if;

    changes:=public.economy_change_balance(challenge.user_id,'CB',case when cb_count<5 then greatest(0,least(50,200-today_cb)) else 0 end,'personal_best',p_challenge);
    cb:=(changes->>'amount')::integer;
    zn:=0;
    if kind in ('mo3','ao5') and zn_count<5 then
      changes:=public.economy_change_balance(challenge.user_id,'ZN',1,'personal_best',p_challenge);
      zn:=(changes->>'amount')::integer;
    end if;
    insert into public.economy_pb_rewards(user_id,challenge_id,stat,reward_day,cb,zn)
      values(challenge.user_id,p_challenge,kind,today,cb,zn);
    if cb>0 then cb_count:=cb_count+1; end if;
    if zn>0 then zn_count:=zn_count+1; end if;
    today_cb:=today_cb+cb;
  end loop;
end;
$$;

create or replace function public.economy_race_bonus(p_match public.economy_race_escrow,p_winner uuid,p_day date)
returns void language plpgsql security invoker set search_path = '' as $$
declare pair_count integer; wins_now integer; bonus integer:=0; paid bigint; ledger_paid bigint; reward_key text;
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
  elsif wins_now=5 then bonus:=150; end if;
  insert into public.economy_race_streaks(user_id,wins)
    values(p_winner,wins_now%5) on conflict(user_id) do update set wins=excluded.wins;
  if bonus>0 then
    reward_key:=p_day::text||'/'||wins_now;
    if exists(select 1 from public.economy_receipts where user_id=p_winner and kind='race_streak_milestone' and request_id=reward_key) then return; end if;
    select coalesce(sum((result->>'nominal')::integer),0) into paid from public.economy_receipts
      where user_id=p_winner and kind='race_streak_milestone' and request_id like p_day::text||'/%';
    -- Legacy ledgers can contain repeated 50 CB awards collapsed by the backfill.
    select coalesce(sum(amount),0) into ledger_paid from public.currency_ledger
      where user_id=p_winner and reason='race_streak'
        and created_at>=p_day::timestamp at time zone 'Asia/Ho_Chi_Minh'
        and created_at<(p_day+1)::timestamp at time zone 'Asia/Ho_Chi_Minh';
    paid:=greatest(paid,ledger_paid);
    perform public.economy_change_balance(p_winner,'CB',least(bonus,greatest(200-paid,0)),'race_streak',p_match.round_id::uuid);
    insert into public.economy_receipts(user_id,kind,request_id,payload,result)
      values(p_winner,'race_streak_milestone',reward_key,jsonb_build_object('round',p_match.round_id),jsonb_build_object('nominal',bonus));
  end if;
end;
$$;

-- Weights are per 1000 ordinary spins. Forced milestone draws keep their own rules.
update public.shop_catalog_rules
set rules=jsonb_set(rules,'{wheel,bands}','[{"id":"red","weight":10},{"id":"gold","weight":20},{"id":"purple","weight":120},{"id":"blue","weight":250},{"id":"white","weight":350},{"id":"cb200","weight":50},{"id":"cb100","weight":200}]'::jsonb)
where singleton;

commit;
