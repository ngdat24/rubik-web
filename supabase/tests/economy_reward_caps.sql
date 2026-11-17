begin;
insert into auth.users(id,email) values
 ('b8000000-0000-4000-8000-000000000001','caps@example.invalid'),
 ('b8000000-0000-4000-8000-000000000002','opponent1@example.invalid'),
 ('b8000000-0000-4000-8000-000000000003','opponent2@example.invalid'),
 ('b8000000-0000-4000-8000-000000000004','opponent3@example.invalid');
insert into public.profiles(id,name) values
 ('b8000000-0000-4000-8000-000000000001','Caps Player'),
 ('b8000000-0000-4000-8000-000000000002','Opponent One'),
 ('b8000000-0000-4000-8000-000000000003','Opponent Two'),
 ('b8000000-0000-4000-8000-000000000004','Opponent Three');
set local role service_role;
do $$
declare
 p uuid:='b8000000-0000-4000-8000-000000000001';
 opponents uuid[]:=array['b8000000-0000-4000-8000-000000000002','b8000000-0000-4000-8000-000000000003','b8000000-0000-4000-8000-000000000004']::uuid[];
 today date:=public.economy_day(clock_timestamp()); id uuid; seed text; payload jsonb;
 winnings public.economy_race_escrow; before_cb bigint; new_best bigint; minimum bigint;
begin
 -- Dense improvements: hitting the CB cap must leave the distinct weekly ZN entitlement available.
 for i in 1..32 loop
   id:=gen_random_uuid();seed:=lpad(to_hex(i+80000),64,'0');
   perform public.practice_issue(p,id,seed,3::smallint);
   payload:=jsonb_build_object('id','cap-pb-'||i,'seed',seed,'size',3,'scrambleIndex',0,
     'scrambleSource','generated','penalty','none');
   perform public.practice_finish(p,id,payload,20,case when i<=10 then 60000 else greatest(5000,60000-(i-10)*2300) end,true);
 end loop;
 if (select sum(cb) from public.economy_pb_rewards where user_id=p)<>200
   or (select count(*) from public.economy_pb_rewards where user_id=p and zn>0)<>5 then
   raise exception 'Independent daily CB / weekly ZN PB caps failed';
 end if;
 if (select sum(amount) from public.currency_ledger where user_id=p and reason='solo_solve')<>750
   then raise exception 'Solo cap not independent'; end if;
 if (select time_ms from public.economy_personal_bests where user_id=p and size=3 and stat='single')<>9400
   then raise exception 'PB progression stopped at cap'; end if;
 if (select sum(amount) from public.currency_ledger where user_id=p and currency_type='CB')
    <>(public.economy_wallet_snapshot(p)->>'cb')::bigint then raise exception 'CB ledger does not reconcile'; end if;

 -- The next day can use only the fifth remaining weekly CB reward.
 for i in 1..3 loop
   id:=gen_random_uuid();seed:=lpad(to_hex(i+90000),64,'0');
   insert into public.practice_challenges(id,user_id,seed,size,issued_at,completed_at,solve,solve_id,move_count,effective_ms,eligible)
     values(id,p,seed,3,(today+1)::timestamp at time zone 'Asia/Ho_Chi_Minh',
       ((today+1)::timestamp+interval '12 hours'+i*interval '1 minute') at time zone 'Asia/Ho_Chi_Minh',
       '{"penalty":"none"}','next-day-pb-'||i,20,9400-i*1300,true);
   perform public.economy_record_pb(id);
   perform public.economy_record_pb(id);
 end loop;
 if (select sum(cb) from public.economy_pb_rewards where user_id=p)<>250
   or (select count(*) from public.economy_pb_rewards where user_id=p and cb>0)<>5
   or (select count(*) from public.economy_pb_rewards where user_id=p and zn>0)<>5 then
   raise exception 'Weekly PB quota exceeded across midnight';
 end if;
 -- Three opponents permit a genuine five-win streak; the 100 CB stake qualifies too.
 select (public.economy_wallet_snapshot(p)->>'cb')::bigint into before_cb;
 for i in 1..9 loop
   insert into public.economy_race_escrow(round_id,room_id,player_a,player_b,start_ms,stake,state,result,winner,finished_at)
     values(replace(gen_random_uuid()::text,'-',''),'TEST0001',p,opponents[1+(i-1)/3],
       floor(extract(epoch from clock_timestamp())*1000)::bigint-202000,100,'settled','win',p,clock_timestamp())
     returning * into winnings;
   perform public.economy_race_bonus(winnings,p,today);
 end loop;
 if (select sum(amount) from public.currency_ledger where user_id=p and reason='race_streak')<>200 then
   raise exception '3/5 milestones are not exactly 50 plus 150 once per day';
 end if;
 if (public.economy_wallet_snapshot(p)->>'cb')::bigint<>before_cb+200 then raise exception 'Streak amount incorrect'; end if;
 if (select count(*) from public.economy_receipts where user_id=p and kind='race_streak_milestone')<>2
   then raise exception 'Streak did not record both milestone receipts'; end if;

 -- Verify every discrete RNG bucket, including the boundaries of red and gold.
 if public.shop_band(public.shop_catalog()->'wheel'->'bands',9)<>'red'
   or public.shop_band(public.shop_catalog()->'wheel'->'bands',10)<>'gold'
   or public.shop_band(public.shop_catalog()->'wheel'->'bands',29)<>'gold'
   or public.shop_band(public.shop_catalog()->'wheel'->'bands',30)<>'purple' then
   raise exception 'Incorrect rare-tier boundaries';
 end if;
 if (select count(*) from generate_series(0,999) roll where public.shop_band(public.shop_catalog()->'wheel'->'bands',roll)='red')<>10
   or (select count(*) from generate_series(0,999) roll where public.shop_band(public.shop_catalog()->'wheel'->'bands',roll)='gold')<>20 then
   raise exception 'Incorrect 1 percent / 2 percent rates';
 end if;
 if (select sum((entry->>'weight')::integer) from jsonb_array_elements(public.shop_catalog()->'wheel'->'bands') entry)<>1000
   or exists(select 1 from generate_series(0,999) roll where public.shop_band(public.shop_catalog()->'wheel'->'bands',roll) is null) then
   raise exception 'Wheel does not total 100 percent';
 end if;
end;
$$;
rollback;
