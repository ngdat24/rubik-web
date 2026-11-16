begin;

-- Existing Time Limit history does not become a source of rewards retroactively.
alter table public.time_limit_sessions add column economy_tracked boolean not null default false;
alter table public.time_limit_sessions alter column economy_tracked set default true;

create table public.economy_daily_quests (
  user_id uuid references public.user_wallets(user_id) on delete cascade,
  quest_day date,
  completed_mask smallint not null default 0 check (completed_mask between 0 and 7),
  streak_awarded boolean not null default false,
  primary key (user_id,quest_day)
);
create table public.economy_time_limit_finished (
  session_id text primary key references public.time_limit_sessions(id) on delete cascade,
  user_id uuid not null references public.user_wallets(user_id) on delete cascade,
  quest_day date not null
);
create index economy_time_limit_quest_player on public.economy_time_limit_finished(user_id,quest_day);
create table public.economy_personal_bests (
  user_id uuid references public.user_wallets(user_id) on delete cascade,
  size smallint check (size between 2 and 5),
  stat text check (stat in ('single','mo3','ao5','ao12')),
  time_ms bigint not null check (time_ms >= 0),
  primary key (user_id,size,stat)
);
create table public.economy_pb_rewards (
  user_id uuid references public.user_wallets(user_id) on delete cascade,
  challenge_id uuid references public.practice_challenges(id) on delete cascade,
  stat text,
  reward_day date not null,
  cb integer not null,
  zn integer not null,
  primary key (user_id,challenge_id,stat)
);
create index economy_pb_rewards_by_day on public.economy_pb_rewards(user_id,reward_day);

do $$
declare table_name text;
begin
  foreach table_name in array array['economy_daily_quests','economy_time_limit_finished',
    'economy_personal_bests','economy_pb_rewards'] loop
    execute format('alter table public.%I enable row level security',table_name);
    execute format('revoke all on public.%I from public, anon, authenticated',table_name);
    execute format('grant select,insert,update,delete on public.%I to service_role',table_name);
  end loop;
end;
$$;

create function public.economy_day(p_at timestamptz)
returns date language sql immutable strict set search_path = '' as $$
  select (p_at at time zone 'Asia/Ho_Chi_Minh')::date
$$;

create function public.economy_quest_counts(p_user uuid,p_day date)
returns integer[] language sql stable set search_path = '' as $$
  select array[count(*) filter(where size=2),count(*) filter(where size=3),
    count(*) filter(where size=4),count(*) filter(where size=5)]::integer[]
  from public.practice_challenges
  where user_id=p_user and eligible
    and completed_at>=p_day::timestamp at time zone 'Asia/Ho_Chi_Minh'
    and completed_at<(p_day+1)::timestamp at time zone 'Asia/Ho_Chi_Minh'
$$;

create function public.economy_streak_days(p_user uuid,p_day date)
returns integer language plpgsql stable set search_path = '' as $$
declare streak integer:=0; day_row public.economy_daily_quests;
begin
  for offset_days in 0..6 loop
    select * into day_row from public.economy_daily_quests
      where user_id=p_user and quest_day=p_day-offset_days;
    if not found or day_row.completed_mask<>7 then exit; end if;
    -- This milestone closes the preceding cycle. Its own day can still display 7.
    if day_row.streak_awarded and offset_days>0 then exit; end if;
    streak:=streak+1;
  end loop;
  return streak;
end;
$$;

create function public.economy_refresh_quests(p_user uuid,p_day date,p_reference uuid default null)
returns void language plpgsql security invoker set search_path = '' as $$
declare counts integer[]; progress public.economy_daily_quests; achieved integer:=0; new_tasks integer;
begin
  perform public.economy_lock_wallet(p_user);
  counts:=public.economy_quest_counts(p_user,p_day);
  if counts[1]>=10 or counts[2]>=5 or counts[3]>=3 or counts[4]>=1 then achieved:=achieved|1; end if;
  if exists(select 1 from public.economy_time_limit_finished where user_id=p_user and quest_day=p_day)
    then achieved:=achieved|2; end if;
  if counts[2]>=10 then achieved:=achieved|4; end if;
  if achieved=0 then return; end if;
  insert into public.economy_daily_quests(user_id,quest_day) values(p_user,p_day) on conflict do nothing;
  select * into strict progress from public.economy_daily_quests where user_id=p_user and quest_day=p_day;
  new_tasks:=achieved & ~progress.completed_mask;
  if new_tasks=0 then return; end if;

  if (new_tasks&1)=1 then perform public.economy_change_balance(p_user,'CB',50,'quest_practice',p_reference); end if;
  if (new_tasks&2)=2 then perform public.economy_change_balance(p_user,'CB',50,'quest_time_limit',p_reference); end if;
  if (new_tasks&4)=4 then perform public.economy_change_balance(p_user,'CB',100,'quest_ten_solves',p_reference); end if;
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

create function public.economy_record_pb(p_challenge uuid)
returns void language plpgsql security invoker set search_path = '' as $$
declare
  challenge public.practice_challenges; recent bigint[]; values_window bigint[];
  kind text; needed integer; score bigint; old_score bigint; today date; week_start date;
  prior_count integer; paid_count integer; today_cb integer; cb integer; zn integer;
  changes jsonb;
begin
  select * into strict challenge from public.practice_challenges where id=p_challenge;
  if challenge.eligible is distinct from true or challenge.completed_at is null then return; end if;
  perform public.economy_lock_wallet(challenge.user_id);
  select array_agg(effective_ms order by completed_at desc,id desc) into recent from (
    select effective_ms,completed_at,id from public.practice_challenges
    where user_id=challenge.user_id and size=challenge.size and eligible
    order by completed_at desc,id desc limit 12
  ) last_solves;
  prior_count:=cardinality(recent)-1;
  today:=public.economy_day(challenge.completed_at);
  week_start:=date_trunc('week',today::timestamp)::date;
  select count(*) filter(where rewards.cb>0 or rewards.zn>0),coalesce(sum(rewards.cb) filter(where rewards.reward_day=today),0)
    into paid_count,today_cb from public.economy_pb_rewards rewards
    where user_id=challenge.user_id and reward_day>=week_start and reward_day<week_start+7;

  foreach kind in array array['single','mo3','ao5','ao12'] loop
    needed:=case kind when 'single' then 1 when 'mo3' then 3 when 'ao5' then 5 else 12 end;
    if cardinality(recent)<needed then continue; end if;
    if kind='single' then score:=challenge.effective_ms;
    elsif kind='mo3' then
      select round(avg(ms))::bigint into score from unnest(recent[1:3]) ms;
    else
      values_window:=recent[1:needed];
      select round((sum(ms)-min(ms)-max(ms))/(needed-2))::bigint into score from unnest(values_window) ms;
    end if;
    select time_ms into old_score from public.economy_personal_bests
      where user_id=challenge.user_id and size=challenge.size and stat=kind;
    if old_score is not null and score>=old_score then continue; end if;
    insert into public.economy_personal_bests(user_id,size,stat,time_ms)
      values(challenge.user_id,challenge.size,kind,score)
      on conflict(user_id,size,stat) do update set time_ms=excluded.time_ms;
    if old_score is null or prior_count<10 or paid_count>=5
      or today_cb>=200 or old_score-score<greatest(ceil(old_score*0.02),200) then continue; end if;

    changes:=public.economy_change_balance(challenge.user_id,'CB',least(50,200-today_cb),'personal_best',p_challenge);
    cb:=(changes->>'amount')::integer;
    zn:=0;
    if kind in ('mo3','ao5') then
      changes:=public.economy_change_balance(challenge.user_id,'ZN',1,'personal_best',p_challenge);
      zn:=(changes->>'amount')::integer;
    end if;
    insert into public.economy_pb_rewards(user_id,challenge_id,stat,reward_day,cb,zn)
      values(challenge.user_id,p_challenge,kind,today,cb,zn);
    if cb>0 or zn>0 then paid_count:=paid_count+1; end if;
    today_cb:=today_cb+cb;
  end loop;
end;
$$;

create function public.economy_record_practice_progress()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  perform public.economy_refresh_quests(new.user_id,public.economy_day(new.completed_at),new.id);
  perform public.economy_record_pb(new.id);
  return new;
end;
$$;
create trigger economy_solo_progress after update of completed_at on public.practice_challenges
  for each row when (old.completed_at is null and new.completed_at is not null and new.eligible is true)
  execute function public.economy_record_practice_progress();

create function public.economy_record_time_limit_quest(p_user uuid,p_id text)
returns void language plpgsql security invoker set search_path = '' as $$
declare session public.time_limit_sessions; completed_day date;
begin
  select * into session from public.time_limit_sessions where id=p_id and user_id=p_user for update;
  if not found or not session.economy_tracked or session.abandoned or session.mode<>'fullSolve'
    or session.start_ms+201000>floor(extract(epoch from clock_timestamp())*1000)::bigint then return; end if;
  perform public.economy_lock_wallet(p_user);
  completed_day:=public.economy_day(to_timestamp((session.start_ms+198000)/1000.0));
  insert into public.economy_time_limit_finished(session_id,user_id,quest_day)
    values(p_id,p_user,completed_day) on conflict do nothing;
  if found then perform public.economy_refresh_quests(p_user,completed_day); end if;
end;
$$;

create function public.time_limit_with_quests(p_user uuid,p_id text,p_action text,p_payload jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare snapshot jsonb;
begin
  snapshot:=public.time_limit_action(p_user,p_id,p_action,p_payload);
  perform public.economy_record_time_limit_quest(p_user,p_id);
  return snapshot;
end;
$$;

create function public.economy_progress_snapshot(p_user uuid)
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
    'counts',public.economy_quest_counts(p_user,today),'pbs',pbs);
end;
$$;

revoke all on function public.economy_day(timestamptz), public.economy_quest_counts(uuid,date),
  public.economy_streak_days(uuid,date), public.economy_refresh_quests(uuid,date,uuid),
  public.economy_record_pb(uuid), public.economy_record_practice_progress(),
  public.economy_record_time_limit_quest(uuid,text), public.time_limit_with_quests(uuid,text,text,jsonb),
  public.economy_progress_snapshot(uuid) from public, anon, authenticated;
grant execute on function public.economy_day(timestamptz), public.economy_quest_counts(uuid,date),
  public.economy_streak_days(uuid,date), public.economy_refresh_quests(uuid,date,uuid),
  public.economy_record_pb(uuid), public.economy_record_practice_progress(),
  public.economy_record_time_limit_quest(uuid,text), public.time_limit_with_quests(uuid,text,text,jsonb),
  public.economy_progress_snapshot(uuid) to service_role;

commit;
