begin;
insert into auth.users(id,email) values
  ('f2000000-0000-4000-8000-000000000001','race-a@example.invalid'),
  ('f2000000-0000-4000-8000-000000000002','race-b@example.invalid');
insert into public.profiles(id,name) values
  ('f2000000-0000-4000-8000-000000000001','Escrow A'),
  ('f2000000-0000-4000-8000-000000000002','Escrow B');
set local role service_role;
do $$
declare
  a uuid:='f2000000-0000-4000-8000-000000000001'; b uuid:='f2000000-0000-4000-8000-000000000002';
  stamp bigint:=floor(extract(epoch from clock_timestamp())*1000)::bigint;
  client_a text:=repeat('a',32); client_b text:=repeat('b',32);
  room_code text:='GAME0001'; round_code text; response jsonb; wager public.economy_race_escrow;
  played jsonb;
begin
  perform public.economy_change_balance(a,'CB',1000,'test',null);
  response:=public.lobby_action_with_escrow(a,room_code,'create',
    jsonb_build_object('client',client_a,'mode','fullSolve','seed','test'));
  response:=public.lobby_action_with_escrow(b,room_code,'join',jsonb_build_object('client',client_b,'seed','test'));
  round_code:=response->'room'->>'round_id';
  response:=public.lobby_action_with_escrow(a,room_code,'stake',
    jsonb_build_object('client',client_a,'round',round_code,'stake',200));
  perform public.lobby_action_with_escrow(a,room_code,'ready',
    jsonb_build_object('client',client_a,'round',round_code,'mode','fullSolve','stake',200));
  begin
    perform public.lobby_action_with_escrow(b,room_code,'ready',
      jsonb_build_object('client',client_b,'round',round_code,'mode','fullSolve','stake',200));
    raise exception 'Not enough funds but charged';
  exception when raise_exception then
    if sqlerrm<>'insufficient_balance' then raise; end if;
  end;
  if (public.economy_wallet_snapshot(a)->>'cb')::integer<>1000 or
    exists(select 1 from public.economy_race_escrow where round_id=round_code) then raise exception 'Partial charge'; end if;
  perform public.economy_change_balance(b,'CB',1000,'test',null);
  response:=public.lobby_action_with_escrow(a,room_code,'stake',
    jsonb_build_object('client',client_a,'round',round_code,'stake',300));
  if (response->'room'->'players'->0->>'ready')::boolean then raise exception 'Stake changed without clearing readiness'; end if;
  begin
    perform public.lobby_action_with_escrow(b,room_code,'ready',
      jsonb_build_object('client',client_b,'round',round_code,'mode','fullSolve','stake',200));
    raise exception 'Stale stake accepted';
  exception when raise_exception then
    if sqlerrm<>'Wager changed' then raise; end if;
  end;
  perform public.lobby_action_with_escrow(a,room_code,'ready',
    jsonb_build_object('client',client_a,'round',round_code,'mode','fullSolve','stake',300));
  perform public.lobby_action_with_escrow(b,room_code,'ready',
    jsonb_build_object('client',client_b,'round',round_code,'mode','fullSolve','stake',300));
  select * into strict wager from public.economy_race_escrow where round_id=round_code;
  if wager.state<>'locked' or public.economy_wallet_snapshot(a)<>'{"cb":700,"zn":0}'
    or public.economy_wallet_snapshot(b)<>'{"cb":700,"zn":0}' then raise exception 'Stake was not locked'; end if;

  played:='[{"endT":45000}]';
  update public.race_lobbies set players=(
    select jsonb_agg(player||jsonb_build_object('runs',played,'until',wager.start_ms+220000) order by ord)
    from jsonb_array_elements(players) with ordinality entries(player,ord)
  ) where id=room_code;
  insert into public.economy_race_moves(round_id,user_id,cube_index,cost) values(round_code,a,0,20),(round_code,b,0,21);
  wager:=public.economy_settle_race(round_code,wager.start_ms+200999);
  if wager.state<>'locked' then raise exception 'Settled before network grace'; end if;
  wager:=public.economy_settle_race(round_code,wager.start_ms+201000);
  if wager.winner<>a or wager.burned_cb<>60 or wager.state<>'settled' then raise exception 'Wrong race resolution'; end if;
  perform public.economy_settle_race(round_code,wager.start_ms+202000);
  if public.economy_wallet_snapshot(a)<>'{"cb":1240,"zn":0}'
    or public.economy_wallet_snapshot(b)<>'{"cb":700,"zn":0}' then raise exception 'Wrong award or double settlement'; end if;

  -- A different round where both clients lost presence has no winner.
  round_code:=repeat('c',32);
  update public.race_lobbies set round_id=round_code,start_ms=stamp,players=(
    select jsonb_agg(player||jsonb_build_object('runs','[]'::jsonb,'until',stamp+25000) order by ord)
      from jsonb_array_elements(players) with ordinality entries(player,ord)
  ) where id=room_code;
  perform public.economy_lock_race((select r from public.race_lobbies r where id=room_code),200);
  wager:=public.economy_settle_race(round_code,stamp+30000);
  if wager.state<>'refunded' or wager.winner is not null
    or public.economy_wallet_snapshot(a)<>'{"cb":1240,"zn":0}'
    or public.economy_wallet_snapshot(b)<>'{"cb":700,"zn":0}' then raise exception 'Lost connection did not refund'; end if;
  -- Explicit cancellation refunds both stakes once, including retries.
  round_code:=repeat('d',32);
  update public.race_lobbies set round_id=round_code,start_ms=stamp,forfeit=null where id=room_code;
  perform public.economy_lock_race((select r from public.race_lobbies r where id=room_code),100);
  wager:=public.economy_settle_race(round_code,stamp+1000,true);
  if wager.state is distinct from 'refunded' or wager.result is distinct from 'cancelled' then
    raise exception 'Early cancellation did not refund'; end if;
  perform public.economy_settle_race(round_code,stamp+2000,true);
  if public.economy_wallet_snapshot(a)<>'{"cb":1240,"zn":0}'
    or public.economy_wallet_snapshot(b)<>'{"cb":700,"zn":0}' then raise exception 'Cancellation refund repeated'; end if;

end;
$$;
rollback;
