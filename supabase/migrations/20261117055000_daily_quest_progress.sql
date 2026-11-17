begin;

create table public.economy_quest_solves (
  solve_id text primary key references public.solves(id) on delete cascade,
  user_id uuid not null references public.user_wallets(user_id) on delete cascade,
  quest_day date not null,
  size smallint not null check (size between 2 and 10)
);
create index economy_quest_solves_account_day on public.economy_quest_solves(user_id,quest_day);

create table public.economy_quest_presence (
  user_id uuid references public.user_wallets(user_id) on delete cascade,
  quest_day date,
  last_seen timestamptz not null,
  active_ms integer not null default 0 check (active_ms between 0 and 600000),
  primary key (user_id,quest_day)
);
alter table public.economy_quest_solves enable row level security;
alter table public.economy_quest_presence enable row level security;
revoke all on public.economy_quest_solves,public.economy_quest_presence from public,anon,authenticated;
grant select,insert,update on public.economy_quest_solves,public.economy_quest_presence to service_role;

create or replace function public.economy_quest_counts(p_user uuid,p_day date)
returns integer[] language sql stable set search_path = '' as $$
  select array[count(*) filter(where size=2),count(*) filter(where size=5),
    count(*) filter(where size>=4 and size<>5)]::integer[]
  from public.economy_quest_solves where user_id=p_user and quest_day=p_day
$$;



create or replace function public.economy_refresh_quests(p_user uuid,p_day date,p_reference uuid default null)
returns void language plpgsql security invoker set search_path = '' as $$
declare counts integer[]; progress public.economy_daily_quests; achieved integer:=0; new_tasks integer;
begin
  perform public.economy_lock_wallet(p_user);
  counts:=public.economy_quest_counts(p_user,p_day);
  if counts[1]>=5 or counts[2]>=3 or counts[3]>=1 then achieved:=achieved|1; end if;
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

create or replace function public.economy_record_time_limit_quest(p_user uuid,p_id text)
returns void language plpgsql security invoker set search_path = '' as $$
declare session public.time_limit_sessions; completed_day date;
begin
  select * into session from public.time_limit_sessions where id=p_id and user_id=p_user for update;
  if not found or not session.economy_tracked or session.abandoned
    or session.start_ms+201000>floor(extract(epoch from clock_timestamp())*1000)::bigint then return; end if;
  perform public.economy_lock_wallet(p_user);
  completed_day:=public.economy_day(to_timestamp((session.start_ms+198000)/1000.0));
  insert into public.economy_time_limit_finished(session_id,user_id,quest_day)
    values(p_id,p_user,completed_day) on conflict do nothing;
  if found then perform public.economy_refresh_quests(p_user,completed_day); end if;
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


create function public.save_solve_with_quests(p_user uuid,p_solve jsonb,p_override text,p_deleted boolean,
  p_ranked boolean,p_expected bigint)
returns setof public.solves language plpgsql security invoker set search_path = '' as $$
declare already_saved boolean; saved public.solves; day date;
begin
  -- Match save_solve's account lock so parallel retries cannot register the same solve twice.
  perform pg_advisory_xact_lock_shared(584027,2);
  perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
  select exists(select 1 from public.solves where id=p_solve->>'id') into already_saved;
  select * into strict saved from public.save_solve(p_user,p_solve,p_override,p_deleted,p_ranked,p_expected);
  if not already_saved and not saved.deleted and saved.time_ms is not null
    and exists(select 1 from public.profiles where id=p_user) then
    perform public.economy_lock_wallet(p_user);
    day:=public.economy_day(saved.created_at);
    insert into public.economy_quest_solves values(saved.id,p_user,day,saved.size) on conflict do nothing;
    if found then perform public.economy_refresh_quests(p_user,day); end if;
  end if;
  return next saved;
end;
$$;

create function public.economy_quest_heartbeat(p_user uuid)
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

revoke all on function public.save_solve_with_quests(uuid,jsonb,text,boolean,boolean,bigint),
  public.economy_quest_heartbeat(uuid) from public,anon,authenticated;
grant execute on function public.save_solve_with_quests(uuid,jsonb,text,boolean,boolean,bigint),
  public.economy_quest_heartbeat(uuid) to service_role;

commit;
