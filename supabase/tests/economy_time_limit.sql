begin;
insert into auth.users(id,email)
  values ('f1666666-6666-4666-8666-666666666666','time-eco@example.invalid');
insert into public.profiles(id,name)
  values ('f1666666-6666-4666-8666-666666666666','Time Economy Test');
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
    if idx=1 and ticket.kind<>'free_ticket' then raise exception 'First ticket is not free'; end if;
    if idx in (2,3) and ticket.kind<>'paid_ticket' then raise exception 'Wrong paid quota'; end if;
    if idx=4 and ticket.kind<>'practice' then raise exception 'Fourth session should be practice'; end if;
    if idx in (5,6) and ticket.session_id is not null then raise exception 'Non-reward session charged'; end if;
    if idx<=4 then
      if to_jsonb(ticket) is distinct from to_jsonb(public.economy_time_limit_ticket(player,session,stamp+3100)) then
        raise exception 'Ticket changed on retry';
      end if;
    end if;
    payout:=public.economy_time_limit_settle(player,session,stamp+200999);
    if payout.session_id is not null then raise exception 'Paid before grace expired'; end if;
    payout:=public.economy_time_limit_settle(player,session,stamp+201000);
    if idx=1 and (payout.cb<>145 or payout.zn<>1) then raise exception 'Wrong two-cube payout'; end if;
    if idx=2 and (payout.cb<>205 or payout.zn<>1) then raise exception 'Wrong three-cube payout'; end if;
    if idx=3 and (payout.cb<>205 or payout.zn<>0) then raise exception 'Wrong paid cap'; end if;
    if idx>=4 and payout.session_id is not null then raise exception 'Unpaid session awarded'; end if;
    if idx<=3 and to_jsonb(payout) is distinct from to_jsonb(public.economy_time_limit_settle(player,session,stamp+202000)) then
      raise exception 'Payout changed on retry';
    end if;
  end loop;
  if public.economy_wallet_snapshot(player)<>'{"cb":1355,"zn":2}' then raise exception 'Wallet total does not reconcile'; end if;
end;
$$;
rollback;
