begin;
insert into auth.users(id,email) values
 ('f1777777-7777-4777-8777-777777777777','weekly-a@example.invalid'),
 ('f1888888-8888-4888-8888-888888888888','weekly-b@example.invalid'),
 ('f1999999-9999-4999-8999-999999999999','weekly-c@example.invalid');
insert into public.profiles(id,name) values
 ('f1777777-7777-4777-8777-777777777777','Weekly A'),
 ('f1888888-8888-4888-8888-888888888888','Weekly B'),
 ('f1999999-9999-4999-8999-999999999999','Weekly C');
set local role service_role;
do $$
declare
  a uuid:='f1777777-7777-4777-8777-777777777777'; b uuid:='f1888888-8888-4888-8888-888888888888';
  c uuid:='f1999999-9999-4999-8999-999999999999';
  previous_week date:=public.economy_week(statement_timestamp())-7;
  kickoff timestamptz:=previous_week::timestamp at time zone 'Asia/Ho_Chi_Minh';
  board jsonb; week_result jsonb;
begin
  insert into public.practice_challenges
    (id,user_id,seed,size,issued_at,completed_at,solve,solve_id,move_count,effective_ms,eligible)
  select gen_random_uuid(),player,repeat(seed,64),size,kickoff-interval '1 minute',finish,'{}',seed,35,ms,eligible
  from (values
    (a,'a',3,kickoff,7000,true),(a,'b',3,kickoff+interval '1 second',8000,true),
    (b,'c',3,kickoff+interval '2 seconds',9000,true),(c,'d',3,kickoff+interval '3 seconds',10000,true),
    (c,'e',3,kickoff-interval '1 second',1000,true),(c,'f',3,kickoff+interval '7 days',1200,true),
    (a,'1',3,kickoff,300,false),(c,'9',6,kickoff,600,true),
    (c,'8',3,kickoff,1500,true)
  ) entries(player,seed,size,finish,ms,eligible);
  begin
    perform public.economy_close_week(previous_week+7);
    raise exception 'Current week could be closed';
  exception when raise_exception then
    if sqlerrm <> 'week_not_closed' then raise; end if;
  end;
  perform public.economy_change_balance(a,'ZN',58,'test',null);
  if public.economy_close_week(previous_week)<>2 or public.economy_close_week(previous_week)<>0 then
    raise exception 'Duplicate or incorrect winners';
  end if;
  board:=public.economy_weekly_board(3,true);
  if jsonb_array_length(board->'rows')<>4 or board->'rows'->0->>'rewardZn'<>'2'
    or board->'rows'->1->'rewardZn'<>'null'::jsonb or board->'rows'->2->>'rewardZn'<>'1' then
    raise exception 'Wrong weekly board hours, ties, deduplication or cap: %',board;
  end if;
  if public.economy_wallet_snapshot(a) <> '{"cb":0,"zn":60}'
    or public.economy_wallet_snapshot(b) <> '{"cb":0,"zn":1}'
    or public.economy_wallet_snapshot(c) <> '{"cb":0,"zn":0}' then raise exception 'Incorrect weekly wallet totals'; end if;
  perform public.economy_maintain();
  week_result:=public.economy_maintain();
  if (week_result->>'weeklyAwards')::integer<>0 then raise exception 'Maintenance repeated payout'; end if;
  if jsonb_array_length(public.economy_weekly_board(6,true)->'rows')<>1
    then raise exception 'Large cube ranking missing'; end if;
end;
$$;
rollback;
