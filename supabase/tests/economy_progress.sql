begin;
insert into auth.users(id,email) values
  ('f1444444-4444-4444-8444-444444444444','progress-test@example.invalid'),
  ('f1555555-5555-4555-8555-555555555555','progress-cap@example.invalid');
insert into public.profiles(id,name) values
  ('f1444444-4444-4444-8444-444444444444','Progress Test'),
  ('f1555555-5555-4555-8555-555555555555','Progress Cap Test');
set local role service_role;
do $$
declare
  player uuid:='f1444444-4444-4444-8444-444444444444';
  capped uuid:='f1555555-5555-4555-8555-555555555555';
  challenge uuid; seed text; payload jsonb; global_test_day date:=public.economy_day(clock_timestamp());
  quest_date date; session text; best jsonb;
begin
  for idx in 201..210 loop
    challenge:=gen_random_uuid(); seed:=lpad(to_hex(idx+300),64,'0');
    perform public.practice_issue(player,challenge,seed,3::smallint);
    payload:=jsonb_build_object('id','progress-old-'||idx,'seed',seed,'size',3,'scrambleIndex',0,
      'scrambleSource','generated','penalty','+2');
    perform public.practice_finish(player,challenge,payload,12,3500,true);
  end loop;
  if public.economy_quest_counts(player,global_test_day) <> array[0,0,0,0]
    or exists(select 1 from public.economy_personal_bests where user_id=player) then
    raise exception 'Old eligibility leaked into quests or PB';
  end if;
  for idx in 1..11 loop
    challenge:=gen_random_uuid(); seed:=lpad(to_hex(idx+300),64,'0');
    perform public.practice_issue(player,challenge,seed,3::smallint);
    payload:=jsonb_build_object('id','progress-pb-'||idx,'seed',seed,'size',3,'scrambleIndex',0,
      'scrambleSource','generated','penalty','none');
    perform public.practice_finish(player,challenge,payload,20,case when idx<=10 then 20000 else 18000 end,true);
    if idx=10 and exists(select 1 from public.economy_pb_rewards where user_id=player)
      then raise exception 'PB before ten prior qualifying solves'; end if;
  end loop;
  if (select sum(cb) from public.economy_pb_rewards where user_id=player)<>100
    or (select sum(zn) from public.economy_pb_rewards where user_id=player)<>1
    then raise exception 'Incorrect single or mo3 payout'; end if;
  best:=public.economy_progress_snapshot(player);
  if (best->>'completed')::integer<>5 then raise exception 'Solo quests 1 and 3 should be finished: %',best; end if;

  -- Daily CB cap does not consume the remaining weekly ZN entitlement.
  insert into public.economy_pb_rewards(user_id,challenge_id,stat,reward_day,cb,zn) values
    (player,challenge,'ao5',global_test_day,50,0),(player,challenge,'ao12',global_test_day,50,0);
  challenge:=gen_random_uuid(); seed:=repeat('f',64);
  perform public.practice_issue(player,challenge,seed,3::smallint);
  payload:=jsonb_build_object('id','progress-after-cap','seed',seed,'size',3,'scrambleIndex',0,
    'scrambleSource','generated','penalty','none');
  perform public.practice_finish(player,challenge,payload,20,15000,true);
  if (select sum(cb) from public.economy_pb_rewards where user_id=player)<>200
    or (select sum(zn) from public.economy_pb_rewards where user_id=player)<>2 then
    raise exception 'CB daily cap incorrectly blocked PB ZN';
  end if;

  insert into public.time_limit_sessions(id,user_id,mode,seed,start_ms,economy_tracked)
    values(repeat('0',32),player,'fullSolve','old',floor(extract(epoch from clock_timestamp())*1000)::bigint-202000,false);
  perform public.economy_record_time_limit_quest(player,repeat('0',32));
  if exists(select 1 from public.economy_time_limit_finished where user_id=player)
    then raise exception 'Old Time Limit counted'; end if;
  insert into public.time_limit_sessions(id,user_id,mode,seed,start_ms)
    values(repeat('1',32),player,'fullSolve','new',floor(extract(epoch from clock_timestamp())*1000)::bigint-201100);
  perform public.economy_record_time_limit_quest(player,repeat('1',32));
  perform public.economy_record_time_limit_quest(player,repeat('1',32));
  if (select count(*) from public.currency_ledger where user_id=player and reason='quest_time_limit')<>1
    then raise exception 'Time Limit quest failed or paid twice'; end if;

  perform public.economy_change_balance(capped,'CB',50000,'test',null);
  perform public.economy_change_balance(capped,'ZN',60,'test',null);
  for offset_days in reverse 7..1 loop
    quest_date:=global_test_day-offset_days;
    session:=lpad(to_hex(offset_days+3000),32,'0');
    insert into public.time_limit_sessions(id,user_id,mode,seed,start_ms)
      values(session,capped,'fullSolve','test',0);
    insert into public.economy_time_limit_finished(session_id,user_id,quest_day) values(session,capped,quest_date);
    for idx in 1..10 loop
      seed:=lpad(to_hex(1000+offset_days*10+idx),64,'0');
      insert into public.practice_challenges(id,user_id,seed,size,issued_at,completed_at,solve,solve_id,move_count,effective_ms,eligible)
        values(gen_random_uuid(),capped,seed,3,quest_date::timestamp at time zone 'Asia/Ho_Chi_Minh',
          (quest_date::timestamp+interval '1 minute') at time zone 'Asia/Ho_Chi_Minh',
          '{}',seed,20,30000,true);
    end loop;
    perform public.economy_refresh_quests(capped,quest_date);
  end loop;
  if not exists(select 1 from public.economy_daily_quests where user_id=capped and quest_day=global_test_day-1
      and completed_mask=7 and streak_awarded) then raise exception 'Capped streak progress was lost'; end if;
  if public.economy_wallet_snapshot(capped)<>'{"cb":50000,"zn":60}' then raise exception 'Quest exceeded wallet cap'; end if;
  if public.economy_streak_days(capped,global_test_day)<>0 then raise exception 'Previous cycle leaked'; end if;
end;
$$;
rollback;
