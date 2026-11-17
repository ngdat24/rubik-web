begin;
insert into auth.users(id,email) values
  ('c1111111-1111-4111-8111-111111111111','champion-a@example.invalid'),
  ('c2222222-2222-4222-8222-222222222222','champion-b@example.invalid');
insert into public.profiles(id,name) values
  ('c1111111-1111-4111-8111-111111111111','Champion A'),
  ('c2222222-2222-4222-8222-222222222222','Champion B');
set local role service_role;
do $$
declare a uuid:='c1111111-1111-4111-8111-111111111111';
  b uuid:='c2222222-2222-4222-8222-222222222222'; result jsonb;
begin
  if public.champion_snapshot(a)->'awards'<>'[]'::jsonb then raise exception 'Unexpected award'; end if;
  begin
    perform public.champion_claim(a,2,'classic','Locked');
    raise exception 'Unapproved claim allowed';
  exception when raise_exception then
    if sqlerrm<>'champion_not_granted' then raise; end if;
  end;
  perform public.champion_grant(a,2);
  perform public.champion_grant(a,2);
  result:=public.champion_claim(a,2,'classic','My Champion');
  if jsonb_array_length(result->'awards')<>1 or result#>>'{awards,0,name}'<>'My Champion'
    then raise exception 'Wrong claim'; end if;
  if public.champion_claim(a,2,'classic','My Champion')<>result then raise exception 'Retry changed claim'; end if;
  perform public.champion_grant(a,2);
  begin
    perform public.champion_claim(a,2,'borderless','Other');
    raise exception 'Permanent choice overwritten';
  exception when raise_exception then
    if sqlerrm<>'champion_already_claimed' then raise; end if;
  end;
  perform public.champion_grant(a,3);
  perform public.champion_claim(a,3,'borderless','Other Size');
  if jsonb_array_length(public.champion_snapshot(a)->'awards')<>2 then raise exception 'Size isolation'; end if;
  if public.champion_snapshot(b)->'awards'<>'[]'::jsonb then raise exception 'Other user inherited award'; end if;
  perform public.economy_lock_wallet(a);
  update public.user_wallets set cubit_balance=1000 where user_id=a;
  perform public.champion_rename(a,2,'Renamed','c3333333-3333-4333-8333-333333333333');
  perform public.champion_rename(a,2,'Renamed','c3333333-3333-4333-8333-333333333333');
  if (select cubit_balance from public.user_wallets where user_id=a)<>500 then raise exception 'Rename retry charged twice'; end if;
  if public.champion_snapshot(a)#>>'{awards,0,variant}'<>'classic' then raise exception 'Rename changed variant'; end if;
  begin
    perform public.champion_rename(a,3,'Wrong Payload','c3333333-3333-4333-8333-333333333333');
    raise exception 'Receipt payload not bound';
  exception when raise_exception then
    if sqlerrm<>'receipt_mismatch' then raise; end if;
  end;
  perform public.champion_rename(a,3,'Renamed 3','c4444444-4444-4444-8444-444444444444');
  begin
    perform public.champion_rename(a,2,'No Funds','c5555555-5555-4555-8555-555555555555');
    raise exception 'Insufficient balance accepted';
  exception when raise_exception then
    if sqlerrm<>'insufficient_balance' then raise; end if;
  end;
  if public.champion_snapshot(a)#>>'{awards,0,name}'<>'Renamed'
    or (select count(*) from public.currency_ledger where user_id=a and reason='champion_rename')<>2
    then raise exception 'Rename transaction not atomic'; end if;
  begin
    perform public.champion_grant(b,4);
    raise exception 'Invalid size allowed';
  exception when raise_exception then
    if sqlerrm<>'invalid_champion' then raise; end if;
  end;
end;
$$;
reset role;
do $$
begin
  if has_function_privilege('anon','public.champion_grant(uuid,integer)','EXECUTE')
    or has_function_privilege('authenticated','public.champion_claim(uuid,integer,text,text)','EXECUTE')
    or has_table_privilege('authenticated','public.champion_awards','INSERT')
    then raise exception 'Public award mutation permitted'; end if;
end;
$$;
rollback;
