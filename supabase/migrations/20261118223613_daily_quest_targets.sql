begin;

create or replace function public.economy_refresh_quests(p_user uuid,p_day date,p_reference uuid default null)
returns void language plpgsql security invoker set search_path = '' as $$
declare counts integer[]; progress public.economy_daily_quests; achieved integer:=0; new_tasks integer;
begin
  perform public.economy_lock_wallet(p_user);
  counts:=public.economy_quest_counts(p_user,p_day);
  if counts[1]>=8 or counts[2]>=4 or counts[3]+counts[4]>=1 then achieved:=achieved|1; end if;
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

commit;
