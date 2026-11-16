-- Run after the migration. Every fixture is rolled back.
begin;
insert into auth.users(id,email) values
 ('f1111111-1111-4111-8111-111111111111','time-limit-a@example.invalid'),
 ('f2222222-2222-4222-8222-222222222222','time-limit-b@example.invalid');
insert into public.profiles(id,name) values
 ('f1111111-1111-4111-8111-111111111111','Time Limit test A'),
 ('f2222222-2222-4222-8222-222222222222','Time Limit test B');
set local role service_role;
do $$ declare
 a uuid:='f1111111-1111-4111-8111-111111111111';b uuid:='f2222222-2222-4222-8222-222222222222';
 session_id text:=repeat('e',32);other_id text:=repeat('f',32);v jsonb;top_id text;
 run jsonb:='{"k":0,"startT":0,"endT":5,"events":[{"m":"R","t":5}],"preEvents":[],"result":"solved"}';
begin
 v:=public.time_limit_action(a,session_id,'create','{"mode":"fullSolve","seed":"original"}');
 assert v->'room'->>'duration_ms'='180000';assert jsonb_array_length(v->'room'->'players')=1;
 perform public.time_limit_action(a,session_id,'create','{"mode":"oneFace","seed":"replacement"}');
 assert (select seed from public.time_limit_sessions where id=session_id)='original';
 assert (select mode from public.time_limit_sessions where id=session_id)='fullSolve';
 begin perform public.time_limit_action(b,session_id,'get');raise exception using errcode='XX000',message='Other user read seed';exception when raise_exception then null;end;
 begin perform public.time_limit_action(a,session_id,'cube_done',jsonb_build_object('run',run,'moveCost',2));raise exception using errcode='XX000',message='Early receipt accepted';exception when raise_exception then null;end;
 update public.time_limit_sessions set start_ms=floor(extract(epoch from clock_timestamp())*1000)-19000 where id=session_id;
 perform public.time_limit_action(a,session_id,'cube_done',jsonb_build_object('run',run,'moveCost',2));
 perform public.time_limit_action(a,session_id,'cube_done',jsonb_build_object('run',run,'moveCost',999));
 assert (select score from public.time_limit_sessions where id=session_id)=1;
 assert (select total_moves from public.time_limit_sessions where id=session_id)=2;
 begin perform public.time_limit_action(a,session_id,'cube_done',jsonb_build_object('run',jsonb_set(run,'{endT}','6'),'moveCost',2));raise exception using errcode='XX000',message='Conflicting receipt accepted';exception when raise_exception then null;end;
 assert not exists(select 1 from public.time_limit_leaderboard('fullSolve')),'Running attempt ranked';
 perform public.time_limit_action(a,session_id,'forfeit');
 update public.time_limit_sessions set start_ms=floor(extract(epoch from clock_timestamp())*1000)-300000 where id=session_id;
 assert not exists(select 1 from public.time_limit_leaderboard('fullSolve')),'Canceled attempt ranked';
 perform public.time_limit_action(a,other_id,'create','{"mode":"fullSolve","seed":"late"}');
 update public.time_limit_sessions set start_ms=floor(extract(epoch from clock_timestamp())*1000)-300000 where id=other_id;
 begin perform public.time_limit_action(a,other_id,'cube_done',jsonb_build_object('run',run,'moveCost',2));raise exception using errcode='XX000',message='Late receipt accepted';exception when raise_exception then null;end;
 perform public.time_limit_action(a,other_id,'forfeit');
 assert not (select abandoned from public.time_limit_sessions where id=other_id),'Final attempt changed by late forfeit';
 -- Finished attempts, repeated user, all tie breakers, top ten, and exclusions.
 insert into public.time_limit_sessions(id,user_id,mode,seed,start_ms,score,last_end_t,total_moves)
 select lpad(to_hex(i),32,'0'),a,'oneFace','ranking',floor(extract(epoch from now())*1000)-300000,2,100+i,50 from generate_series(1,12) i;
 insert into public.time_limit_sessions(id,user_id,mode,seed,start_ms,score,last_end_t,total_moves) values
 (repeat('a',32),a,'oneFace','best',floor(extract(epoch from now())*1000)-300000,3,179000,10),
 (repeat('b',32),b,'oneFace','moves-tie',floor(extract(epoch from now())*1000)-300000,3,179000,100),
 (repeat('c',32),a,'oneFace','still-running',floor(extract(epoch from now())*1000),999,179000,10),
 (repeat('d',32),a,'f2lRush','different-mode',floor(extract(epoch from now())*1000)-300000,999,179000,10);
 assert (select count(*) from public.time_limit_leaderboard('oneFace'))=10;
 select id into top_id from public.time_limit_leaderboard('oneFace') limit 1;assert top_id=repeat('a',32),'Wrong order';
 assert not exists(select 1 from public.time_limit_leaderboard('oneFace') where id in (repeat('c',32),repeat('d',32)));
 assert (select count(*) from public.time_limit_leaderboard('oneFace') where name='Time Limit test A')=9;
 assert not has_table_privilege('anon','public.time_limit_sessions','select');
 assert not has_table_privilege('authenticated','public.time_limit_sessions','select');
 assert not has_function_privilege('anon','public.time_limit_action(uuid,text,text,jsonb)','execute');
 assert not has_function_privilege('authenticated','public.time_limit_action(uuid,text,text,jsonb)','execute');
 assert not has_function_privilege('anon','public.time_limit_leaderboard(text)','execute');
end $$;
reset role;
do $$ begin assert exists(select 1 from pg_constraint where conrelid='public.time_limit_sessions'::regclass and confrelid='auth.users'::regclass and contype='f' and confdeltype='c'),'Missing account deletion cascade';end $$;
rollback;
