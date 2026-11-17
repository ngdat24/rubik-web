begin;
insert into auth.users(id,email) values
  ('f2333333-3333-4333-8333-333333333333','signup-gift@example.invalid');
set local role service_role;
insert into public.profiles(id,name) values
  ('f2333333-3333-4333-8333-333333333333','Signup Gift Test');
do $$
declare player uuid:='f2333333-3333-4333-8333-333333333333';
begin
  if public.economy_wallet_snapshot(player)<>'{"cb":200,"zn":0}' then
    raise exception 'Signup did not grant exactly 200 CB'; end if;
  if exists(select 1 from public.practice_challenges where user_id=player) then
    raise exception 'Fixture unexpectedly has qualifying solves'; end if;
  if not exists(select 1 from public.economy_receipts where user_id=player
    and kind='starter' and request_id='v2' and payload->>'requiredSolves'='0') then
    raise exception 'Missing one-time signup receipt'; end if;
  perform public.economy_change_balance(player,'CB',-200,'test_spend',null);
  update public.profiles set name='Signup Gift Renamed' where id=player;
  perform public.economy_award_starter(player,null);
  perform public.economy_wallet_snapshot(player);
  if public.economy_wallet_snapshot(player)<>'{"cb":0,"zn":0}' or
    (select count(*) from public.currency_ledger where user_id=player and reason='starter_reward')<>1 then
    raise exception 'Read, rename or retry refilled the gift after spending'; end if;
  begin
    insert into public.profiles(id,name) values(player,'Duplicate Signup');
    raise exception 'Duplicate profile was inserted';
  exception when unique_violation then null;
  end;
  if (select sum(amount) from public.currency_ledger where user_id=player and currency_type='CB')<>0 then
    raise exception 'Signup ledger does not reconcile'; end if;
end;
$$;
set local role authenticated;
do $$ begin
  if has_function_privilege(current_user,'public.economy_signup_starter()','EXECUTE') or
    has_function_privilege(current_user,'public.economy_award_starter(uuid,uuid)','EXECUTE') then
    raise exception 'Browser role can directly claim signup rewards'; end if;
end $$;
rollback;
