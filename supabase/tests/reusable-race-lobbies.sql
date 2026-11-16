-- Real SQL/RLS/transaction tests. Fixtures never survive this transaction.
begin;
insert into auth.users(id,email) values
 ('f3333333-3333-4333-8333-333333333333','lobby-a@example.invalid'),
 ('f4444444-4444-4444-8444-444444444444','lobby-b@example.invalid'),
 ('f5555555-5555-4555-8555-555555555555','lobby-c@example.invalid');
insert into public.profiles(id,name) values
 ('f3333333-3333-4333-8333-333333333333','Lobby test A'),
 ('f4444444-4444-4444-8444-444444444444','Lobby test B'),
 ('f5555555-5555-4555-8555-555555555555','Lobby test C');
set local role service_role;
do $$ declare
 a uuid:='f3333333-3333-4333-8333-333333333333';b uuid:='f4444444-4444-4444-8444-444444444444';c uuid:='f5555555-5555-4555-8555-555555555555';
 ca text:=repeat('a',32);cb text:=repeat('b',32);cc text:=repeat('c',32);
 v jsonb;rd text;old_rd text;mode text;n bigint;run jsonb;
begin
 v:=public.lobby_action(a,'SQLROOM2','create',jsonb_build_object('client',ca,'mode','fullSolve','seed','first'));
 assert v->'room'->>'id'='SQLROOM2';rd:=v->'room'->>'round_id';
 perform public.lobby_action(a,'SQLROOM2','create',jsonb_build_object('client',ca,'mode','oneFace','seed','ignored'));
 assert (select seed from public.race_lobbies where id='SQLROOM2')='first';
 begin perform public.lobby_action(b,'SQLROOM2','create',jsonb_build_object('client',cb,'mode','fullSolve','seed','wrong'));raise exception using errcode='XX000',message='Code hijack';exception when raise_exception then null;end;
 v:=public.lobby_action(b,'SQLROOM2','join',jsonb_build_object('client',cb,'seed','joined'));rd:=v->'room'->>'round_id';
 begin perform public.lobby_action(c,'SQLROOM2','join',jsonb_build_object('client',cc,'seed','third'));raise exception using errcode='XX000',message='Third player';exception when raise_exception then null;end;
 foreach mode in array array['fullSolve','oneFace','f2lRush'] loop
   old_rd:=rd;
   v:=public.lobby_action(a,'SQLROOM2','mode',jsonb_build_object('client',ca,'round',rd,'mode',mode,'seed','mode-'||mode));rd:=v->'room'->>'round_id';
   if (v->'room'->>'start_ms') is null then
     perform public.lobby_action(a,'SQLROOM2','ready',jsonb_build_object('client',ca,'round',rd,'mode',mode));
     v:=public.lobby_action(b,'SQLROOM2','ready',jsonb_build_object('client',cb,'round',rd,'mode',mode));
   else
     perform public.lobby_action(a,'SQLROOM2','rematch',jsonb_build_object('client',ca,'round',rd,'mode',mode,'seed','unused'));
     assert (select round_id from public.race_lobbies where id='SQLROOM2')=rd;
     v:=public.lobby_action(b,'SQLROOM2','rematch',jsonb_build_object('client',cb,'round',rd,'mode',mode,'seed','next-'||mode));rd:=v->'room'->>'round_id';
     assert rd<>old_rd;
     begin perform public.lobby_action(a,'SQLROOM2','cube_done',jsonb_build_object('client',ca,'round',old_rd,'run','{}'::jsonb));raise exception using errcode='XX000',message='Old round receipt';exception when raise_exception then null;end;
   end if;
   assert v->'room'->>'mode'=mode;assert v->'room'->>'duration_ms'='180000';assert v->'room'->>'start_ms' is not null;
   begin perform public.lobby_action(a,'SQLROOM2','mode',jsonb_build_object('client',ca,'round',rd,'mode','fullSolve','seed','bad'));raise exception using errcode='XX000',message='Changed running mode';exception when raise_exception then null;end;
   n:=floor(extract(epoch from clock_timestamp())*1000)::bigint;
   update public.race_lobbies set start_ms=n-19000 where id='SQLROOM2';
   -- RPC receives pre-verified runs from Node; test storage/ACK idempotency here.
   run:=jsonb_build_object('k',0,'startT',0,'endT',5,'preEvents','[]'::jsonb,'events',jsonb_build_array(jsonb_build_object('m','R','t',5)),
     'result',case mode when 'oneFace' then 'face' when 'f2lRush' then 'f2l' else 'solved' end);
   perform public.lobby_action(a,'SQLROOM2','cube_done',jsonb_build_object('client',ca,'round',rd,'run',run));
   perform public.lobby_action(a,'SQLROOM2','cube_done',jsonb_build_object('client',ca,'round',rd,'run',run));
   assert (select jsonb_array_length(players->0->'runs') from public.race_lobbies where id='SQLROOM2')=1;
   update public.race_lobbies set start_ms=n-202000 where id='SQLROOM2';
 end loop;
 -- Mode selection invalidates both votes, not the result of the old round.
 perform public.lobby_action(a,'SQLROOM2','rematch',jsonb_build_object('client',ca,'round',rd,'mode','f2lRush','seed','vote'));
 perform public.lobby_action(b,'SQLROOM2','mode',jsonb_build_object('client',cb,'round',rd,'mode','oneFace','seed','mode'));
 assert not (select (players->0->>'rematch')::boolean from public.race_lobbies where id='SQLROOM2');
 assert (select r.mode from public.race_lobbies r where id='SQLROOM2')='f2lRush';
 update public.race_lobbies set created_at=now()-interval '2 hours' where id='SQLROOM2';
 perform public.lobby_action(a,'SQLROOM2','get',jsonb_build_object('client',ca));
 -- New tab/reload owns the connection; an old pagehide packet cannot evict it.
 perform public.lobby_action(a,'SQLROOM2','join',jsonb_build_object('client',cc,'seed','rejoin'));
 perform public.lobby_action(a,'SQLROOM2','leave',jsonb_build_object('client',ca));
 assert (select (players->0->>'present')::boolean from public.race_lobbies where id='SQLROOM2');
 perform public.lobby_action(b,'SQLROOM2','leave',jsonb_build_object('client',cb));
 assert exists(select 1 from public.race_lobbies where id='SQLROOM2');
 v:=public.lobby_action(a,'SQLROOM2','leave',jsonb_build_object('client',cc));
 assert (v->>'gone')::boolean;assert not exists(select 1 from public.race_lobbies where id='SQLROOM2');
 -- Pagehide has a short lease; complete network/power loss has the normal lease.
 perform public.lobby_action(a,'SQLROOM3','create',jsonb_build_object('client',ca,'mode','fullSolve','seed','expire'));
 v:=public.lobby_action(a,'SQLROOM3','leave',jsonb_build_object('client',ca,'depart',true));
 assert (v->'room'->'players'->0->>'until')::bigint<=(v->>'now_ms')::bigint+5000;
 update public.race_lobbies set players=jsonb_set(players,'{0,until}',to_jsonb(0::bigint)),expires_ms=0 where id='SQLROOM3';
 v:=public.lobby_action(a,'SQLROOM3','get',jsonb_build_object('client',ca));assert (v->>'gone')::boolean;
 assert not has_table_privilege('anon','public.race_lobbies','SELECT');
 assert not has_table_privilege('authenticated','public.race_lobbies','UPDATE');
 assert not has_function_privilege('authenticated','public.lobby_action(uuid,text,text,jsonb)','EXECUTE');
 assert (select relrowsecurity from pg_class where oid='public.race_lobbies'::regclass);
end $$;
rollback;
