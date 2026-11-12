-- Run as postgres in a development Supabase SQL editor AFTER the migration.
-- This transaction creates test-only users/data and rolls everything back.
begin;
insert into auth.users(id,email) values
 ('f1111111-1111-4111-8111-111111111111','rubik-rls-a@example.invalid'),
 ('f2222222-2222-4222-8222-222222222222','rubik-rls-b@example.invalid');
insert into public.profiles(id,name) values
 ('f1111111-1111-4111-8111-111111111111','RLS test A'),
 ('f2222222-2222-4222-8222-222222222222','RLS test B');

set local role service_role;
select public.save_solve('f1111111-1111-4111-8111-111111111111',
 '{"id":"rls-a","size":3,"timeMs":1000,"penalty":"none"}',null,false,true,null);
select public.save_solve('f2222222-2222-4222-8222-222222222222',
 '{"id":"rls-b","size":3,"timeMs":2000,"penalty":"none"}',null,false,true,null);
select public.save_solve('f1111111-1111-4111-8111-111111111111',
 '{"id":"rls-a","size":3,"timeMs":1000,"penalty":"none"}','+2',false,true,1);
do $$ begin
  if (select revision from public.solves where id='rls-a')<>2 then raise exception 'Revision not advanced'; end if;
  if (select time_ms from public.solves where id='rls-a')<>1000 then raise exception 'Override changed original score'; end if;
  begin
    perform public.save_solve('f1111111-1111-4111-8111-111111111111',
      '{"id":"rls-a","size":3,"timeMs":1000,"penalty":"none"}','DNF',false,true,1);
    raise exception 'Stale revision was accepted';
  exception when serialization_failure then null; end;
  begin
    perform public.save_solve('f2222222-2222-4222-8222-222222222222',
      '{"id":"rls-a","size":3,"timeMs":1000,"penalty":"none"}',null,false,true,null);
    raise exception 'Ownership conflict was accepted';
  exception when unique_violation then null; end;
end $$;

do $$ declare before_version bigint; after_version bigint;
begin
  select sync_version into before_version from public.solves where id='rls-a';
  perform public.save_solve('f1111111-1111-4111-8111-111111111111',
    '{"id":"rls-a","size":3,"timeMs":1000,"penalty":"none"}','+2',false,true,2);
  if (select sync_version from public.solves where id='rls-a')<>before_version then raise exception 'Idempotent retry changed cursor'; end if;
  perform public.save_solve('f1111111-1111-4111-8111-111111111111',
    '{"id":"rls-a","size":3,"timeMs":1000,"penalty":"none"}','DNF',true,true,2);
  select sync_version into after_version from public.solves where id='rls-a';
  if after_version<=before_version then raise exception 'Change cursor did not advance'; end if;
  if (select count(*) from public.solves where user_id='f1111111-1111-4111-8111-111111111111' and sync_version>before_version)<>1 then raise exception 'Delta missing deleted row'; end if;
  if not (select deleted from public.solves where id='rls-a') then raise exception 'Missing deletion tombstone'; end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub','f1111111-1111-4111-8111-111111111111',true);
select set_config('request.jwt.claims','{"sub":"f1111111-1111-4111-8111-111111111111","role":"authenticated"}',true);
do $$ begin
  if (select count(*) from public.solves where id in ('rls-a','rls-b'))<>1 then raise exception 'History RLS leak'; end if;
  if exists(select 1 from public.profiles where id='f2222222-2222-4222-8222-222222222222') then raise exception 'Profile RLS leak'; end if;
  if has_table_privilege(current_user,'public.solves','INSERT') or has_table_privilege(current_user,'public.solves','UPDATE') or has_table_privilege(current_user,'public.solves','DELETE') then raise exception 'Direct write privilege'; end if;
  if has_function_privilege(current_user,'public.save_solve(uuid,jsonb,text,boolean,boolean,bigint)','EXECUTE') then raise exception 'Verification RPC exposed'; end if;
end $$;

set local role anon;
do $$ begin
  if has_table_privilege(current_user,'public.solves','SELECT') then raise exception 'Anonymous history privilege'; end if;
  if has_function_privilege(current_user,'public.leaderboard(integer)','EXECUTE') then raise exception 'Unexpected public RPC privilege'; end if;
end $$;

reset role;
delete from auth.users where id='f2222222-2222-4222-8222-222222222222';
do $$ begin
  if exists(select 1 from public.solves where id='rls-b') then raise exception 'Account deletion did not cascade'; end if;
end $$;
rollback;
