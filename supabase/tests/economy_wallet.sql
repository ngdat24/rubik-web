-- Development database only.
begin;
insert into auth.users(id,email)
  values ('f1333333-3333-4333-8333-333333333333','wallet-test@example.invalid');
insert into public.profiles(id,name)
  values ('f1333333-3333-4333-8333-333333333333','Wallet Test');
set local role service_role;
do $$
declare
  player uuid := 'f1333333-3333-4333-8333-333333333333';
  challenge uuid; payload jsonb; receipt jsonb; wallet jsonb; seed text;
begin
  wallet := public.economy_wallet_snapshot(player);
  if wallet <> '{"cb":0,"zn":0}' then raise exception 'Wallet should start at zero'; end if;
  for i in 1..35 loop
    challenge:=gen_random_uuid();
    seed:=lpad(to_hex(i),64,'0');
    perform public.practice_issue(player,challenge,seed,3::smallint);
    payload:=jsonb_build_object('id','wallet-test-'||i,'seed',seed,'size',3,'scrambleIndex',0,
      'scrambleSource','generated','penalty','none');
    receipt:=public.practice_finish(player,challenge,payload,20,15000,true);
    if receipt is distinct from public.practice_finish(player,challenge,payload,20,15000,true)
      then raise exception 'Retry changed receipt'; end if;
    if i=4 and exists(select 1 from public.currency_ledger where reason='starter_reward' and user_id=player)
      then raise exception 'Starter reward paid early'; end if;
    if i=5 and not exists(select 1 from public.currency_ledger where reason='starter_reward' and amount=200 and user_id=player)
      then raise exception 'Starter reward missing'; end if;
  end loop;
  wallet := public.economy_wallet_snapshot(player);
  if (select sum(amount) from public.currency_ledger where user_id=player and reason in ('solo_solve','starter_reward'))<>950 then raise exception 'Unexpected Solo or starter total'; end if;
  if (select count(*) from public.economy_receipts where user_id=player and kind='solo')<>35 then
    raise exception 'Missing receipt for a capped payout';
  end if;
  if (select count(*) from public.currency_ledger where user_id=player and reason='starter_reward')<>1 then
    raise exception 'Starter was paid twice';
  end if;

  perform public.economy_change_balance(player,'CB',60000,'test',null);
  perform public.economy_change_balance(player,'CB',100,'escrow_refund',null,true);
  perform public.economy_change_balance(player,'CB',50,'capped_reward',null);
  if (public.economy_wallet_snapshot(player)->>'cb')::bigint<>50100 then
    raise exception 'Overflow was confiscated';
  end if;
  perform public.economy_change_balance(player,'ZN',100,'test',null);
  perform public.economy_change_balance(player,'ZN',5,'duplicate_gold',null,true);
  if (public.economy_wallet_snapshot(player)->>'zn')::bigint<>65 then raise exception 'ZN overflow lost'; end if;
  begin
    perform public.economy_change_balance(player,'ZN',-66,'test',null);
    raise exception 'Accepted overdraft';
  exception when raise_exception then
    if sqlerrm <> 'insufficient_balance' then raise; end if;
  end;
  if (select sum(amount) from public.currency_ledger where user_id=player and currency_type='CB')<>50100 then
    raise exception 'Ledger does not reconcile';
  end if;
end;
$$;
set local role authenticated;
do $$ begin
  if has_table_privilege(current_user,'public.user_wallets','SELECT')
    or has_function_privilege(current_user,'public.economy_change_balance(uuid,text,bigint,text,uuid,boolean)','EXECUTE')
    then raise exception 'Browser accessible wallet mutation'; end if;
end $$;
rollback;
