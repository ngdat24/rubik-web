begin;
insert into auth.users(id,email) values
 ('a8000000-0000-4000-8000-000000000001','seven-days@example.invalid'),
 ('a8000000-0000-4000-8000-000000000002','quest-boundaries@example.invalid');
insert into public.profiles(id,name) values
 ('a8000000-0000-4000-8000-000000000001','Seven Day Path'),
 ('a8000000-0000-4000-8000-000000000002','Quest Boundaries');
set local role service_role;
do $$
declare
  p uuid:='a8000000-0000-4000-8000-000000000001';
  q uuid:='a8000000-0000-4000-8000-000000000002';
  monday date:=public.economy_week(clock_timestamp())-7; day date; stamp bigint;
  session text; solve text; result jsonb; ticket public.economy_time_limit_tickets;
  payout public.economy_time_limit_payouts; prior_cb bigint; prior_zn bigint;
  today date:=public.economy_day(clock_timestamp()); ledger_count integer;
begin
  -- Ten 2x2, five 3x3, three 4x4 and one 5x5+ are independent alternatives.
  for n in 1..9 loop
    perform public.save_solve_with_quests(q,jsonb_build_object('id','two-'||n,'size',2,'timeMs',3500,'penalty','none'),null,false,true,null);
  end loop;
  if public.economy_progress_snapshot(q)->>'completed'<>'0' then raise exception '2x2 threshold early'; end if;
  perform public.save_solve_with_quests(q,'{"id":"two-10","size":2,"timeMs":3500,"penalty":"none"}',null,false,true,null);
  if public.economy_progress_snapshot(q)->>'completed'<>'1' then raise exception '2x2 threshold missing'; end if;
  perform public.save_solve_with_quests(q,'{"id":"plus-two","size":3,"timeMs":68000,"penalty":"+2"}',null,false,true,null);
  if public.economy_progress_snapshot(q)->>'completed'<>'1' then raise exception 'Solve must not complete online quest'; end if;
  perform public.save_solve_with_quests(q,'{"id":"under-seventy","size":3,"timeMs":67999,"penalty":"+2"}',null,false,true,null);
  if public.economy_progress_snapshot(q)->>'completed'<>'1' then raise exception 'Fast solve must not complete online quest'; end if;
  if public.economy_quest_counts(q,today)<>array[10,2,0,0] or public.economy_quest_counts(q,today+1)<>array[0,0,0,0]
    then raise exception 'Quest count leaked'; end if;

  -- Complete an entire Monday-Sunday without PB, rank awards or random skin drops.
  for d in 0..6 loop
    day:=monday+d;
    for n in 1..5 loop
      solve:='seven-'||d||'-'||n;
      insert into public.solves(id,user_id,solve,size,time_ms,ranked)
        values(solve,p,'{}',3,65000,true);
      insert into public.economy_quest_solves values(solve,p,day,3);
    end loop;
    stamp:=(extract(epoch from ((day::timestamp+interval '12 hours') at time zone 'Asia/Ho_Chi_Minh'))*1000)::bigint;
    for n in 1..4 loop
      session:=lpad(to_hex(8000+d*10+n),32,'0');
      insert into public.time_limit_sessions(id,user_id,mode,seed,start_ms,score)
        values(session,p,'fullSolve','test',stamp+n*220000,2);
      ticket:=public.economy_time_limit_ticket(p,session,stamp+n*220000+3000);
      if ticket.kind<>(case when n=1 then 'free_ticket' else 'paid_ticket' end)
        or ticket.fee<>(case when n=1 then 0 else 100 end) then raise exception 'Ticket price wrong'; end if;
      if public.economy_time_limit_ticket(p,session,stamp+n*220000+4000) is distinct from ticket
        then raise exception 'Ticket charged twice'; end if;
      payout:=public.economy_time_limit_settle(p,session,stamp+n*220000+201000);
      if n=4 and payout.session_id is not null then raise exception 'Fourth ticket awarded money'; end if;
      if n<=3 then
        if payout.cb<>145 then raise exception 'Two-cube amount wrong'; end if;
        if public.economy_time_limit_settle(p,session,stamp+n*220000+202000) is distinct from payout
          then raise exception 'Payout repeated'; end if;
      end if;
      if n=1 then
        insert into public.economy_time_limit_finished values(session,p,day);
      end if;
    end loop;
    insert into public.economy_quest_presence(user_id,quest_day,last_seen,active_ms) values(p,day,clock_timestamp(),600000) on conflict do nothing;
    perform public.economy_refresh_quests(p,day);
    perform public.economy_refresh_quests(p,day);
    if (select completed_mask from public.economy_daily_quests where user_id=p and quest_day=day)<>7
      then raise exception 'Daily checklist incomplete'; end if;
    if (select sum(zn) from public.economy_time_limit_payouts where user_id=p and reward_day=day)>3 then
      raise exception 'Daily Time Limit ZN exceeded'; end if;
  end loop;
  result:=public.economy_wallet_snapshot(p);
  if result->>'zn'<>'30' then raise exception 'Expected 14 daily + 6 streak + 10 TL, got %',result; end if;
  if (select sum(zn) from public.economy_time_limit_payouts where user_id=p)<>10 then raise exception 'Weekly ZN cap wrong'; end if;
  if (select sum(amount) from public.currency_ledger where user_id=p and reason='quest_daily_complete')<>14
    or (select sum(amount) from public.currency_ledger where user_id=p and reason='quest_streak')<>6
    then raise exception 'Daily or streak totals wrong'; end if;
  if public.economy_streak_days(p,monday+8)<>0 then raise exception 'Missed day did not break streak'; end if;
  select count(*) into ledger_count from public.currency_ledger where user_id=p;
  perform public.economy_refresh_quests(p,monday+6);
  if (select count(*) from public.currency_ledger where user_id=p)<>ledger_count then raise exception 'Retry paid again'; end if;

  -- All three CB marginal bands stop at the third solved cube.
  stamp:=stamp+86400000;
  for n in 1..3 loop
    session:=lpad(to_hex(9000+n),32,'0');
    insert into public.time_limit_sessions(id,user_id,mode,seed,start_ms,score)
      values(session,p,'fullSolve','test',stamp+n*220000,case n when 1 then 1 when 2 then 3 else 8 end);
    perform public.economy_time_limit_ticket(p,session,stamp+n*220000+3000);
    payout:=public.economy_time_limit_settle(p,session,stamp+n*220000+201000);
    if payout.cb<>(case n when 1 then 75 else 205 end) then raise exception 'Wrong full solve payout'; end if;
  end loop;
end;
$$;
set local role authenticated;
do $$ begin
  if has_function_privilege(current_user,'public.economy_refresh_quests(uuid,date,uuid)','execute')
    or has_function_privilege(current_user,'public.economy_time_limit_settle(uuid,text,bigint)','execute') then
    raise exception 'Browser can mint currency';
  end if;
end $$;
rollback;
