-- Run with the full migration set in a development database.
begin;
insert into auth.users(id,email) values
  ('f1111111-1111-4111-8111-111111111111','practice-a@example.invalid'),
  ('f2222222-2222-4222-8222-222222222222','practice-b@example.invalid');
insert into public.profiles(id,name) values
  ('f1111111-1111-4111-8111-111111111111','Practice A'),
  ('f2222222-2222-4222-8222-222222222222','Practice B');
set local role service_role;
do $$
declare
  player uuid := 'f1111111-1111-4111-8111-111111111111';
  other uuid := 'f2222222-2222-4222-8222-222222222222';
  a uuid := gen_random_uuid();
  b uuid := gen_random_uuid();
  payload jsonb;
  receipt jsonb;
begin
  perform public.practice_issue(player,a,repeat('a',64),3::smallint);
  perform public.practice_issue(player,b,repeat('b',64),3::smallint);
  payload := jsonb_build_object('id','practice-a','seed',repeat('a',64),'size',3,'scrambleIndex',0,
    'scrambleSource','generated','penalty','none');
  begin
    perform public.practice_finish(other,a,payload,20,2500,true);
    raise exception 'Cross-account challenge accepted';
  exception when raise_exception then
    if sqlerrm <> 'challenge_mismatch' then raise; end if;
  end;
  begin
    perform public.practice_finish(player,a,payload || '{"scrambleIndex":2}',20,2500,true);
    raise exception 'Mismatched scramble accepted';
  exception when raise_exception then
    if sqlerrm <> 'challenge_mismatch' then raise; end if;
  end;
  receipt := public.practice_finish(player,a,payload,20,2500,true);
  if receipt is distinct from public.practice_finish(player,a,payload,20,2500,true) then
    raise exception 'Identical retry changed receipt';
  end if;
  begin
    perform public.practice_finish(player,a,payload || '{"id":"different"}',20,2500,true);
    raise exception 'Challenge accepted a second solve';
  exception when raise_exception then
    if sqlerrm <> 'challenge_used' then raise; end if;
  end;
  begin
    perform public.practice_finish(player,b,payload || jsonb_build_object('seed',repeat('b',64)),20,2500,true);
    raise exception 'Same solve ID accepted for a second challenge';
  exception when raise_exception then
    if sqlerrm <> 'challenge_used' then raise; end if;
  end;
  if (select count(*) from public.practice_challenges where eligible and completed_at is not null) <> 1 then
    raise exception 'Expected one eligible completion';
  end if;
end;
$$;

set local role authenticated;
do $$ begin
  if has_table_privilege(current_user,'public.practice_challenges','SELECT')
    or has_function_privilege(current_user,'public.practice_finish(uuid,uuid,jsonb,integer,bigint,boolean)','EXECUTE')
  then raise exception 'Direct completion access exposed'; end if;
end $$;
rollback;
