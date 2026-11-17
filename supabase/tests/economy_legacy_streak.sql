begin;
insert into auth.users(id,email) values
 ('bc000000-0000-4000-8000-000000000001','legacy-streak@example.invalid'),
 ('bc000000-0000-4000-8000-000000000002','partial-streak@example.invalid');
insert into public.profiles(id,name) values
 ('bc000000-0000-4000-8000-000000000001','Legacy Streak'),
 ('bc000000-0000-4000-8000-000000000002','Partial Streak');
set local role service_role;
do $$
declare p uuid; day date:=public.economy_day(clock_timestamp()); match public.economy_race_escrow;
begin
  foreach p in array array['bc000000-0000-4000-8000-000000000001','bc000000-0000-4000-8000-000000000002']::uuid[] loop
    -- Old policy allowed repeated 50 CB milestones; new backfill collapses their receipt identity.
    for i in 1..(case when p::text like '%001' then 4 else 1 end) loop
      perform public.economy_change_balance(p,'CB',50,'race_streak',null);
    end loop;
    insert into public.economy_receipts(user_id,kind,request_id,payload,result)
      values(p,'race_streak_milestone',day::text||'/3','{"migrated":true}','{"nominal":50}');
    insert into public.economy_race_streaks values(p,4);
    match.player_a:=p;match.player_b:='bc000000-0000-4000-8000-000000000099';
    match.stake:=100;match.round_id:=replace(gen_random_uuid()::text,'-','');
    perform public.economy_race_bonus(match,p,day);
    if (select sum(amount) from public.currency_ledger where user_id=p and reason='race_streak')<>200 then
      raise exception 'Legacy daily budget lost or valid remaining reward denied';
    end if;
    -- Retrying the milestone after spending does not refill the gift.
    perform public.economy_change_balance(p,'CB',-100,'test_spend',null);
    update public.economy_race_streaks set wins=4 where user_id=p;
    perform public.economy_race_bonus(match,p,day);
    if (select sum(amount) from public.currency_ledger where user_id=p and reason='race_streak')<>200 then
      raise exception 'Legacy streak reward repeated';
    end if;
  end loop;
end;
$$;
rollback;
