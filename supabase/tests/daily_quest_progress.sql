begin;
insert into auth.users(id,email) values
  ('9e000000-0000-4000-8000-000000000001','quests2@example.invalid'),
  ('9e000000-0000-4000-8000-000000000002','quests5@example.invalid');
insert into public.profiles(id,name) values
  ('9e000000-0000-4000-8000-000000000001','Quest Two'),
  ('9e000000-0000-4000-8000-000000000002','Quest Five');

set local role service_role;
do $$
declare
  p uuid:='9e000000-0000-4000-8000-000000000001';
  q uuid:='9e000000-0000-4000-8000-000000000002';
  day date:=public.economy_day(clock_timestamp());
  stamp bigint:=floor(extract(epoch from clock_timestamp())*1000)::bigint;
  result jsonb;
  solve jsonb;
begin
  perform public.save_solve(p,'{"id":"import-old","size":2,"timeMs":2000,"penalty":"none"}',null,false,false,null);
  perform public.save_solve_with_quests(p,'{"id":"import-old","size":2,"timeMs":2000,"penalty":"none"}',null,false,false,null);
  perform public.save_solve_with_quests(p,'{"id":"dnf","size":2,"timeMs":0,"penalty":"DNF"}',null,false,false,null);
  for i in 1..10 loop
    solve:=jsonb_build_object('id','verified-two-'||i,'size',2,'timeMs',75000,'penalty','none');
    perform public.save_solve_with_quests(p,solve,null,false,true,null);
    perform public.save_solve_with_quests(p,solve,null,false,true,null);
    result:=public.economy_progress_snapshot(p);
    if result->'counts'->>0<>i::text or (result->>'completed')::int<>(case when i=10 then 1 else 0 end)
      then raise exception 'Wrong solve progress or duplicate receipt: %',result; end if;
  end loop;

  for i in 1..5 loop
    solve:=jsonb_build_object('id','verified-three-'||i,'size',3,'timeMs',75000,'penalty','none');
    perform public.save_solve_with_quests(q,solve,null,false,false,null);
    result:=public.economy_progress_snapshot(q);
    if result->'counts'->>1<>i::text or (result->>'completed')::int<>(case when i=5 then 1 else 0 end)
      then raise exception '3x3 needs exactly five solves: %',result; end if;
  end loop;
  perform public.save_solve_with_quests(p,'{"id":"verified-six","size":6,"timeMs":3500,"penalty":"+2"}',null,false,false,null);
  if public.economy_quest_counts(p,day)<>array[10,0,0,1] then raise exception 'Large range not credited'; end if;

  perform public.save_solve_with_quests(p,'{"id":"verified-five","size":5,"timeMs":3500,"penalty":"none"}',null,false,false,null);
  if public.economy_quest_counts(p,day)<>array[10,0,0,2] then raise exception '5x5 must count in large range'; end if;

  insert into public.time_limit_sessions(id,user_id,mode,seed,start_ms,abandoned)
    values(repeat('d',32),p,'f2lRush','demo',stamp-202000,true);
  perform public.economy_record_time_limit_quest(p,repeat('d',32));
  if (public.economy_progress_snapshot(p)->>'completed')::int<>1 then raise exception 'Abandoned time limit counted'; end if;
  insert into public.time_limit_sessions(id,user_id,mode,seed,start_ms)
    values(repeat('e',32),p,'oneFace','demo',stamp-202000);
  perform public.economy_record_time_limit_quest(p,repeat('e',32));
  perform public.economy_record_time_limit_quest(p,repeat('e',32));
  if (public.economy_progress_snapshot(p)->>'completed')::int<>3 then raise exception 'Non-full Time Limit did not count'; end if;

  result:=public.economy_quest_heartbeat(p);
  if result->>'onlineSeconds'<>'0' then raise exception 'First heartbeat credited time'; end if;
  update public.economy_quest_presence set last_seen=clock_timestamp()-interval '50 sec',active_ms=590000
    where user_id=p and quest_day=day;
  if public.economy_quest_heartbeat(p)->>'onlineSeconds'<>'590' then raise exception 'Offline gap counted'; end if;
  update public.economy_quest_presence set last_seen=clock_timestamp()-interval '15 sec'
    where user_id=p and quest_day=day;
  result:=public.economy_quest_heartbeat(p);
  if result->>'onlineSeconds'<>'600' or (result->>'completed')::int<>7 then raise exception 'Online quest failed'; end if;
  perform public.economy_quest_heartbeat(p);
  if (select count(*) from public.currency_ledger where user_id=p and reason in ('quest_practice','quest_time_limit','quest_online','quest_daily_complete'))<>4
    then raise exception 'Quest reward duplicated or missing'; end if;
  if public.economy_quest_counts(p,day+1)<>array[0,0,0,0] then raise exception 'Progress leaked to another account or day'; end if;
  if public.economy_progress_snapshot(q)->>'onlineSeconds'<>'0' then raise exception 'Online time leaked to another account'; end if;
end;
$$;
rollback;
