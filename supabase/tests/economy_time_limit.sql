begin;
insert into auth.users(id,email)
  values ('f1666666-6666-4666-8666-666666666666','time-eco@example.invalid');
insert into public.profiles(id,name)
  values ('f1666666-6666-4666-8666-666666666666','Time Economy Test');
-- Isolate these reward/spending fixtures from the separately tested signup gift.
select public.economy_change_balance('f1666666-6666-4666-8666-666666666666','CB',-200,'fixture_signup_offset',null);

set local role service_role;
do $$
declare
  player uuid:='f1666666-6666-4666-8666-666666666666';
  stamp bigint:=1763355600000; session text; ticket public.economy_time_limit_tickets;
  payout public.economy_time_limit_payouts;
begin
  perform public.economy_change_balance(player,'CB',1000,'test',null);
  for idx in 1..6 loop
    session:=lpad(to_hex(idx+5000),32,'0');
    insert into public.time_limit_sessions(id,user_id,mode,seed,start_ms,score,abandoned)
      values(session,player,case when idx=5 then 'f2lRush' else 'fullSolve' end,'test',stamp,least(idx+1,4),idx=6);
    ticket:=public.economy_time_limit_ticket(player,session,stamp+2999);
    if ticket.session_id is not null then raise exception 'Ticket consumed before countdown'; end if;
    ticket:=public.economy_time_limit_ticket(player,session,stamp+3000);
    if idx=1 and ticket.kind is distinct from 'free_ticket' then raise exception 'First ticket is not free'; end if;
    if idx in (2,3) and ticket.kind is distinct from 'paid_ticket' then raise exception 'Wrong paid quota'; end if;
    if idx=4 and ticket.kind is distinct from 'practice' then raise exception 'Fourth session should be practice'; end if;
    if idx in (5,6) and ticket.session_id is not null then raise exception 'Non-reward session charged'; end if;
    if idx<=4 then
      if to_jsonb(ticket) is distinct from to_jsonb(public.economy_time_limit_ticket(player,session,stamp+3100)) then
        raise exception 'Ticket changed on retry';
      end if;
    end if;
    payout:=public.economy_time_limit_settle(player,session,stamp+200999);
    if payout.session_id is not null then raise exception 'Paid before grace expired'; end if;
    payout:=public.economy_time_limit_settle(player,session,stamp+201000);
    if idx=1 and (payout.cb is distinct from 145 or payout.zn is distinct from 1) then raise exception 'Wrong two-cube payout'; end if;
    if idx=2 and (payout.cb is distinct from 205 or payout.zn is distinct from 1) then raise exception 'Wrong three-cube payout'; end if;
    if idx=3 and (payout.cb is distinct from 205 or payout.zn is distinct from 0) then raise exception 'Wrong paid cap'; end if;
    if idx>=4 and payout.session_id is not null then raise exception 'Unpaid session awarded'; end if;
    if idx<=3 and to_jsonb(payout) is distinct from to_jsonb(public.economy_time_limit_settle(player,session,stamp+202000)) then
      raise exception 'Payout changed on retry';
    end if;
  end loop;
  if public.economy_wallet_snapshot(player)<>'{"cb":1355,"zn":2}' then raise exception 'Wallet total does not reconcile'; end if;
  -- Next day: insufficient balance stays a free practice even after a top-up.
  stamp:=stamp+86400000;
  perform public.economy_change_balance(player,'CB',-1355,'test',null);
  for idx in 7..9 loop
    session:=lpad(to_hex(idx+5000),32,'0');
    insert into public.time_limit_sessions(id,user_id,mode,seed,start_ms,score)
      values(session,player,'fullSolve','test',stamp,0);
    ticket:=public.economy_time_limit_ticket(player,session,stamp+3000);
    if idx=7 and ticket.kind is distinct from 'free_ticket' then raise exception 'Daily quota did not reset'; end if;
    if idx=8 then
      if ticket.kind is distinct from 'insufficient' or ticket.fee is distinct from 0 then
        raise exception 'Insufficient balance charged'; end if;
      perform public.economy_change_balance(player,'CB',300,'test',null);
      if (public.economy_time_limit_ticket(player,session,stamp+4000)).kind is distinct from 'insufficient' then
        raise exception 'Existing practice session upgraded after top-up'; end if;
    end if;
    if idx=9 then
      if ticket.kind is distinct from 'paid_ticket' then raise exception 'Insufficient session consumed paid quota'; end if;
      update public.time_limit_sessions set abandoned=true where id=session;
      if (public.economy_time_limit_settle(player,session,stamp+201000)).session_id is not null then
        raise exception 'Cancelled session rewarded'; end if;
    end if;
  end loop;
  if (public.economy_wallet_snapshot(player)->>'cb')::bigint<>200 then raise exception 'Unexpected ticket deductions'; end if;
  -- Ten ZN already received in a new week, while Sunday itself is below its daily cap.
  stamp:=(extract(epoch from ((date_trunc('week',public.economy_day(to_timestamp(stamp/1000.0))::timestamp)
    + interval '13 days 12 hours') at time zone 'Asia/Ho_Chi_Minh'))*1000)::bigint;
  for idx in 20..29 loop
    session:=lpad(to_hex(idx+5000),32,'0');
    insert into public.time_limit_sessions(id,user_id,mode,seed,start_ms,score)
      values(session,player,'fullSolve','test',stamp,2);
    insert into public.economy_time_limit_payouts(session_id,user_id,reward_day,cb,zn)
      values(session,player,public.economy_day(to_timestamp(stamp/1000.0))-6+(idx-20)/2,0,1);
  end loop;
  session:=lpad(to_hex(5030),32,'0');
  insert into public.time_limit_sessions(id,user_id,mode,seed,start_ms,score)
    values(session,player,'fullSolve','test',stamp,2);
  perform public.economy_time_limit_ticket(player,session,stamp+3000);
  payout:=public.economy_time_limit_settle(player,session,stamp+201000);
  if payout.cb is distinct from 145 or payout.zn is distinct from 0 then
    raise exception 'Weekly ZN cap failed'; end if;


end;
$$;
rollback;
