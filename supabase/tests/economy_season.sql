begin;
insert into auth.users(id,email) values
  ('f2111111-1111-4111-8111-111111111111','season-a@example.invalid'),
  ('f2222222-2222-4222-8222-222222222222','season-b@example.invalid');
insert into public.profiles(id,name) values
  ('f2111111-1111-4111-8111-111111111111','Season A'),
  ('f2222222-2222-4222-8222-222222222222','Season B');
-- Isolate these reward/spending fixtures from the separately tested signup gift.
select public.economy_change_balance('f2111111-1111-4111-8111-111111111111','CB',-200,'fixture_signup_offset',null);
select public.economy_change_balance('f2222222-2222-4222-8222-222222222222','CB',-200,'fixture_signup_offset',null);

set local role service_role;
do $$
declare
  a uuid:='f2111111-1111-4111-8111-111111111111'; b uuid:='f2222222-2222-4222-8222-222222222222';
  round_code text:=repeat('7',32); result jsonb;
  stamp bigint:=floor(extract(epoch from clock_timestamp())*1000)::bigint;
begin
  perform public.economy_change_balance(a,'CB',501,'test',null);
  perform public.economy_change_balance(b,'CB',300,'test',null);
  perform public.economy_change_balance(a,'ZN',8,'test',null);
  perform public.economy_change_balance(b,'ZN',2,'test',null);
  insert into public.race_lobbies(id,owner_id,seed,round_id,start_ms,players,expires_ms)
    values('SEASON01',a,'test',round_code,stamp-83000,jsonb_build_array(
      jsonb_build_object('id',a,'present',true,'until',stamp+1000,'runs','[]'::jsonb),
      jsonb_build_object('id',b,'present',true,'until',stamp+1000,'runs','[]'::jsonb)),stamp+1000);
  perform public.economy_lock_race((select room from public.race_lobbies room where id='SEASON01'),200);
  update public.shop_seasons set starts_at=statement_timestamp()-interval '21 days',
    ends_at=statement_timestamp()-interval '1 minute',legacy_shop_unlock_at=statement_timestamp()+interval '30 days'
    where id='season_01';
  begin
    perform public.economy_change_balance(a,'CB',1,'test',null);
    raise exception 'Allowed wallet mutation before pending rollover';
  exception when raise_exception then
    if sqlerrm<>'season_reset_pending' then raise; end if;
  end;
  result:=public.economy_maintain();
  if (result->>'seasons')::integer<>1 or (result->>'escrows')::integer<>1
    then raise exception 'Missing close receipt or refund: %',result; end if;
  if public.economy_wallet_snapshot(a)<>'{"cb":250,"zn":0}'
    or public.economy_wallet_snapshot(b)<>'{"cb":150,"zn":0}' then raise exception 'Reset halved before refund or used wrong rounding'; end if;
  if not exists(select 1 from public.economy_race_escrow where round_id=round_code and state='refunded')
    then raise exception 'Escrow not released'; end if;
  if (public.economy_maintain()->>'seasons')::integer<>0 or
    (public.economy_close_season('season_01')).wallets<>2 then raise exception 'Season reset was not idempotent'; end if;
  if (select sum(amount) from public.currency_ledger where user_id=a and currency_type='CB')<>250
    then raise exception 'Ledger does not reconcile after reset'; end if;
  perform public.economy_change_balance(a,'ZN',1,'next_season_test',null);
  perform public.economy_maintain();
  if (public.economy_wallet_snapshot(a)->>'zn')::integer<>1 then
    raise exception 'Old season reset clobbered new credit'; end if;
end;
$$;
rollback;
