-- Temporary fixtures only: no real accounts or solves are modified.
begin;
insert into auth.users(id,email) values
 ('f1111111-1111-4111-8111-111111111111','race-a@example.invalid'),
 ('f2222222-2222-4222-8222-222222222222','race-b@example.invalid'),
 ('f3333333-3333-4333-8333-333333333333','race-c@example.invalid');
insert into public.profiles(id,name) values
 ('f1111111-1111-4111-8111-111111111111','Race test A'),
 ('f2222222-2222-4222-8222-222222222222','Race test B'),
 ('f3333333-3333-4333-8333-333333333333','Race test C');
set local role service_role;
do $$ declare
 a uuid := 'f1111111-1111-4111-8111-111111111111';
 b uuid := 'f2222222-2222-4222-8222-222222222222';
 c uuid := 'f3333333-3333-4333-8333-333333333333';
 room_id text := repeat('e',32); v jsonb; start_time bigint;
 run jsonb := '{"k":0,"startT":0,"endT":5,"events":[{"m":"R","t":5}],"preEvents":[],"result":"solved"}';
begin
 v := public.race_action(a,room_id,'create','{"mode":"fullSolve","seed":"test-only"}');
 assert v->'room'->>'seed'='test-only';
 perform public.race_action(a,room_id,'create','{"mode":"fullSolve","seed":"replacement"}');
 assert (select seed from public.race_rooms where id=room_id)='test-only','Create retry changed challenge';
 begin perform public.race_action(c,room_id,'get');raise exception using errcode='XX000',message='Nonmember admitted';exception when raise_exception then null;end;
 perform public.race_action(b,room_id,'join');
 perform public.race_action(b,room_id,'join');
 assert (select jsonb_array_length(players) from public.race_rooms where id=room_id)=2;
 begin perform public.race_action(c,room_id,'join');raise exception using errcode='XX000',message='Third player admitted';exception when raise_exception then null;end;
 perform public.race_action(a,room_id,'ready');
 assert (select start_ms is null from public.race_rooms where id=room_id);
 v:=public.race_action(b,room_id,'ready');start_time:=(v->'room'->>'start_ms')::bigint;
 perform public.race_action(b,room_id,'ready');
 assert (select start_ms from public.race_rooms where id=room_id)=start_time,'Ready retry reset clock';
 begin perform public.race_action(a,room_id,'cube_done',jsonb_build_object('run',run));raise exception using errcode='XX000',message='Early move admitted';exception when raise_exception then null;end;
 update public.race_rooms set start_ms=floor(extract(epoch from clock_timestamp())*1000)-19000 where id=room_id;
 perform public.race_action(a,room_id,'cube_done',jsonb_build_object('run',run));
 perform public.race_action(a,room_id,'cube_done',jsonb_build_object('run',run));
 assert (select jsonb_array_length(players->0->'runs') from public.race_rooms where id=room_id)=1,'Duplicate score';
 begin perform public.race_action(a,room_id,'cube_done',jsonb_build_object('run',jsonb_set(run,'{endT}','6')));raise exception using errcode='XX000',message='Conflicting duplicate admitted';exception when raise_exception then null;end;
 begin perform public.race_action(a,room_id,'cube_done',jsonb_build_object('run',jsonb_set(run,'{k}','2')));raise exception using errcode='XX000',message='Skipped cube admitted';exception when raise_exception then null;end;
 update public.race_rooms set start_ms=floor(extract(epoch from clock_timestamp())*1000)-141001 where id=room_id;
 begin perform public.race_action(a,room_id,'cube_done',jsonb_build_object('run',jsonb_set(run,'{k}','1')));raise exception using errcode='XX000',message='Late receipt admitted';exception when raise_exception then null;end;
 perform public.race_action(a,room_id,'cube_done',jsonb_build_object('run',run));
 -- Direct client roles cannot read the hidden seed or call the privileged RPC.
 assert not has_table_privilege('anon','public.race_rooms','select');
 assert not has_table_privilege('authenticated','public.race_rooms','select');
 assert not has_function_privilege('anon','public.race_action(uuid,text,text,jsonb)','execute');
 assert not has_function_privilege('authenticated','public.race_action(uuid,text,text,jsonb)','execute');
end $$;
rollback;
