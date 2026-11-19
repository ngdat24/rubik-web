begin;

create table public.one_on_one_matches (
  id text primary key check (id ~ '^[A-Z0-9]{8}$'),
  owner_id uuid not null references auth.users(id) on delete cascade,
  match_id uuid not null default gen_random_uuid(),
  round_id text not null default replace(gen_random_uuid()::text, '-', ''),
  mode text not null check (mode in ('twoByTwo','fullSolve','f2lRush','oneFace')),
  next_mode text not null check (next_mode in ('twoByTwo','fullSolve','f2lRush','oneFace')),
  round_limit integer not null check (round_limit between 1 and 5),
  duration_ms integer not null check (duration_ms in (60000,120000,180000,240000,300000)),
  currency text,
  stake integer not null,
  check ((currency is null and stake=0) or (currency is not null and
    ((currency='CB' and stake in (100,200,300,500)) or (currency='ZN' and stake in (1,2))))),
  seed text not null,
  start_ms bigint,
  players jsonb not null check (jsonb_array_length(players) between 1 and 2),
  rounds jsonb not null default '[]',
  round_final boolean not null default false,
  match_final boolean not null default false,
  match_winner uuid,
  locked boolean not null default false,
  expires_ms bigint not null
);
create index one_on_one_matches_expiry on public.one_on_one_matches(expires_ms);
create index one_on_one_matches_owner on public.one_on_one_matches(owner_id);
create index one_on_one_matches_players on public.one_on_one_matches using gin(players jsonb_path_ops);
alter table public.one_on_one_matches enable row level security;
revoke all on public.one_on_one_matches from public, anon, authenticated;
grant all on public.one_on_one_matches to service_role;

create function public.one_on_one_settle(r public.one_on_one_matches, winner uuid)
returns void language plpgsql security invoker set search_path='' as $$
declare a uuid; b uuid;
begin
  if not r.locked then return; end if;
  a:=(r.players->0->>'id')::uuid;
  b:=(r.players->1->>'id')::uuid;
  perform public.economy_lock_wallet(least(a,b));
  perform public.economy_lock_wallet(greatest(a,b));
  if winner is null then
    perform public.economy_change_balance(a,r.currency,r.stake,'one_on_one_refund',r.match_id,true);
    perform public.economy_change_balance(b,r.currency,r.stake,'one_on_one_refund',r.match_id,true);
  else
    perform public.economy_change_balance(winner,r.currency,
      case when r.currency='CB' then r.stake*18/10 else r.stake*2 end,
      'one_on_one_winnings',r.match_id,true);
  end if;
end;
$$;

create function public.one_on_one_action(p_user uuid,p_code text,p_action text,p_payload jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  r public.one_on_one_matches;
  n bigint;
  i integer;
  j integer;
  me jsonb;
  a jsonb;
  b jsonb;
  player_name text;
  winner uuid;
  a_wins integer;
  b_wins integer;
  remaining integer;
  remaining_ms bigint;
  result jsonb;
  skins jsonb;
  deadline bigint;
begin
  n:=floor(extract(epoch from clock_timestamp())*1000)::bigint;
  if p_action='create' then
    perform pg_advisory_xact_lock(hashtextextended(p_user::text,91));
    select name into strict player_name from public.profiles where id=p_user;
    if (select count(*) from public.one_on_one_matches where owner_id=p_user and expires_ms>n)>=3 then
      raise exception 'Bạn đã mở quá nhiều phòng.';
    end if;
    insert into public.one_on_one_matches(id,owner_id,mode,next_mode,round_limit,duration_ms,currency,stake,seed,players,expires_ms)
    values(p_code,p_user,p_payload->>'mode',p_payload->>'mode',(p_payload->>'roundLimit')::integer,
      (p_payload->>'durationMs')::integer,p_payload->>'currency',(p_payload->>'stake')::integer,p_payload->>'seed',
      jsonb_build_array(jsonb_build_object('id',p_user,'name',player_name,'ready',false,'runs','[]'::jsonb)),n+1800000)
    on conflict do nothing;
    if not found then raise exception 'Mã phòng đã được dùng.'; end if;
  end if;
  select * into r from public.one_on_one_matches where id=p_code for update;
  n:=floor(extract(epoch from clock_timestamp())*1000)::bigint;
  if not found or r.expires_ms<=n then return jsonb_build_object('gone',true); end if;
  deadline:=r.start_ms+18000+r.duration_ms;
  select (e.ord-1)::integer into i from jsonb_array_elements(r.players) with ordinality e(p,ord) where e.p->>'id'=p_user::text;
  if i is null and p_action='join' and jsonb_array_length(r.players)=1 and r.start_ms is null and not r.match_final then
    select name into strict player_name from public.profiles where id=p_user;
    r.players:=r.players||jsonb_build_array(jsonb_build_object('id',p_user,'name',player_name,'ready',false,'runs','[]'::jsonb));
    i:=1;
  end if;
  if i is null then raise exception 'Bạn không thuộc phòng này hoặc phòng đã đủ người.'; end if;
  j:=1-i;
  me:=r.players->i;
  if p_action='join' and me ? 'departed' then
    r.players:=jsonb_set(r.players,array[i::text],me-'departed');
  elsif p_action<>'leave' and me ? 'departed' then
    raise exception 'Bạn đã rời phòng.';
  end if;
  if p_action not in ('create','join','get','leave') and (p_payload->>'round') is distinct from r.round_id then
    raise exception 'Ván đã đổi. Hãy thử lại.';
  end if;

  if p_action='leave' then
    if jsonb_array_length(r.players)=1 or (r.start_ms is null and jsonb_array_length(r.rounds)=0) then
      delete from public.one_on_one_matches where id=p_code;
      return jsonb_build_object('gone',true);
    end if;
    if not r.match_final then
      r.match_final:=true;
      r.match_winner:=(r.players->j->>'id')::uuid;
      perform public.one_on_one_settle(r,r.match_winner);
      r.locked:=false;
      r.round_final:=true;
    end if;
    r.players:=jsonb_set(r.players,array[i::text],me||'{"departed":true}'::jsonb);
  elsif p_action='mode' then
    if r.owner_id<>p_user or (r.start_ms is not null and not r.round_final) then raise exception 'Chưa thể đổi chế độ.'; end if;
    if r.next_mode is distinct from p_payload->>'mode' then
      r.next_mode:=p_payload->>'mode';
      if r.start_ms is null then r.mode:=r.next_mode; end if;
      select jsonb_agg(e||'{"ready":false}'::jsonb order by ord) into r.players
        from jsonb_array_elements(r.players) with ordinality x(e,ord);
    end if;
  elsif p_action='ready' then
    if r.match_final or (r.start_ms is not null and not r.round_final) or r.next_mode is distinct from p_payload->>'mode' then
      raise exception 'Ván đã đổi hoặc đang chạy.';
    end if;
    r.players:=jsonb_set(r.players,array[i::text,'ready'],'true');
    if jsonb_array_length(r.players)=2 and (r.players->0->>'ready')::boolean and (r.players->1->>'ready')::boolean then
      if r.stake>0 and not r.locked then
        perform public.economy_lock_wallet(least((r.players->0->>'id')::uuid,(r.players->1->>'id')::uuid));
        perform public.economy_lock_wallet(greatest((r.players->0->>'id')::uuid,(r.players->1->>'id')::uuid));
        perform public.economy_change_balance((r.players->0->>'id')::uuid,r.currency,-r.stake,'one_on_one_stake',r.match_id);
        perform public.economy_change_balance((r.players->1->>'id')::uuid,r.currency,-r.stake,'one_on_one_stake',r.match_id);
        r.locked:=true;
      end if;
      r.mode:=r.next_mode;
      r.seed:=p_payload->>'seed';
      r.round_id:=replace(gen_random_uuid()::text,'-','');
      r.round_final:=false;
      r.start_ms:=floor(extract(epoch from clock_timestamp())*1000)::bigint;
      deadline:=r.start_ms+18000+r.duration_ms;
      select jsonb_agg((e-'live'-'outcome')||'{"ready":false,"runs":[]}'::jsonb order by ord) into r.players
        from jsonb_array_elements(r.players) with ordinality x(e,ord);
    end if;
  elsif p_action='rematch' then
    if not r.match_final or (r.players->j) ? 'departed' then raise exception 'Chưa thể đấu lại.'; end if;
    r.players:=jsonb_set(r.players,array[i::text,'rematch'],'true',true);
    if jsonb_array_length(r.players)=2 and (r.players->0->>'rematch')::boolean and (r.players->1->>'rematch')::boolean then
      r.match_id:=gen_random_uuid();
      r.round_id:=replace(gen_random_uuid()::text,'-','');
      r.mode:=r.next_mode;
      r.start_ms:=null;
      r.round_final:=false;
      r.match_final:=false;
      r.match_winner:=null;
      r.rounds:='[]';
      select jsonb_agg((e-'live'-'outcome'-'rematch')||'{"ready":false,"runs":[]}'::jsonb order by ord) into r.players
        from jsonb_array_elements(r.players) with ordinality x(e,ord);
    end if;
  elsif p_action='cube_done' then
    if me->'runs'->0=p_payload->'run' then null;
    elsif r.round_final or r.start_ms is null or n<r.start_ms+18000 or n>=deadline+3000
      or me ? 'outcome' or (p_payload->'run'->>'k')::integer is distinct from 0
      or (p_payload->'run'->>'endT')::integer not between 0 and r.duration_ms then
      raise exception 'Ván đã chốt hoặc quá giờ.';
    else
      r.players:=jsonb_set(r.players,array[i::text],me||jsonb_build_object('runs',jsonb_build_array(p_payload->'run'),'outcome','solved'));
    end if;
  elsif p_action='forfeit' then
    if r.round_final or r.start_ms is null or n>=deadline or me ? 'outcome' then raise exception 'Ván đã chốt.'; end if;
    r.players:=jsonb_set(r.players,array[i::text,'outcome'],'"forfeit"',true);
  elsif p_action='progress' then
    if not r.round_final and r.start_ms is not null and n>=r.start_ms+3000 and n<deadline and not (me ? 'outcome') then
      r.players:=jsonb_set(r.players,array[i::text,'live'],p_payload->'live',true);
    end if;
  elsif p_action not in ('create','join','get','leave') then
    raise exception 'Thao tác phòng không hợp lệ.';
  end if;

  a:=r.players->0;
  b:=r.players->1;
  remaining_ms:=deadline+3000-n;
  if r.start_ms is not null and not r.round_final and (remaining_ms<=0 or (a ? 'outcome' and b ? 'outcome')) then
    if a->>'outcome'='solved' and b->>'outcome'='solved' then
      if (a->'runs'->0->>'endT')::integer<(b->'runs'->0->>'endT')::integer then winner:=(a->>'id')::uuid;
      elsif (a->'runs'->0->>'endT')::integer>(b->'runs'->0->>'endT')::integer then winner:=(b->>'id')::uuid; end if;
    elsif a->>'outcome'='solved' then winner:=(a->>'id')::uuid;
    elsif b->>'outcome'='solved' then winner:=(b->>'id')::uuid;
    elsif a->>'outcome'='forfeit' and b->>'outcome'='forfeit' then
      winner:=(case when me->>'id'=a->>'id' then a->>'id' else b->>'id' end)::uuid;
    elsif a->>'outcome'='forfeit' then winner:=(b->>'id')::uuid;
    elsif b->>'outcome'='forfeit' then winner:=(a->>'id')::uuid;
    end if;
    r.round_final:=true;
    result:=jsonb_build_object('mode',r.mode,'winner',winner,
      'a',a->'runs'->0->'endT','b',b->'runs'->0->'endT');
    r.rounds:=r.rounds||jsonb_build_array(result);
    select count(*) filter(where e->>'winner'=a->>'id'),count(*) filter(where e->>'winner'=b->>'id')
      into a_wins,b_wins from jsonb_array_elements(r.rounds) e;
    remaining:=r.round_limit-jsonb_array_length(r.rounds);
    if remaining=0 or abs(a_wins-b_wins)>remaining then
      r.match_final:=true;
      r.match_winner:=case when a_wins>b_wins then (a->>'id')::uuid when b_wins>a_wins then (b->>'id')::uuid end;
      perform public.one_on_one_settle(r,r.match_winner);
      r.locked:=false;
    end if;
  end if;

  r.expires_ms:=n+1800000;
  update public.one_on_one_matches set match_id=r.match_id, round_id=r.round_id, mode=r.mode, next_mode=r.next_mode,
    seed=r.seed, start_ms=r.start_ms, players=r.players, rounds=r.rounds, round_final=r.round_final,
    match_final=r.match_final,match_winner=r.match_winner,locked=r.locked,expires_ms=r.expires_ms where id=p_code;
  select jsonb_object_agg(user_id,item_id) into skins from public.user_inventory
    where user_id in ((r.players->0->>'id')::uuid,(r.players->1->>'id')::uuid) and kind='skin' and is_equipped;
  return jsonb_build_object('room',to_jsonb(r),'now_ms',n,'skins',coalesce(skins,'{}'::jsonb));
end;
$$;

create function public.one_on_one_expire() returns void
language plpgsql security invoker set search_path='' as $$
declare r public.one_on_one_matches;
begin
  for r in select * from public.one_on_one_matches
    where expires_ms<=floor(extract(epoch from clock_timestamp())*1000)::bigint for update skip locked
  loop
    perform public.one_on_one_settle(r,null);
    delete from public.one_on_one_matches where id=r.id;
  end loop;
end;
$$;

create function public.one_on_one_forget(p_user uuid) returns void
language plpgsql security invoker set search_path='' as $$
declare r public.one_on_one_matches;
begin
  for r in select * from public.one_on_one_matches
    where players @> jsonb_build_array(jsonb_build_object('id',p_user)) order by id for update
  loop
    perform public.one_on_one_settle(r,null);
    delete from public.one_on_one_matches where id=r.id;
  end loop;
end;
$$;

revoke all on function public.one_on_one_action(uuid,text,text,jsonb), public.one_on_one_settle(public.one_on_one_matches,uuid),
  public.one_on_one_expire(), public.one_on_one_forget(uuid) from public, anon, authenticated;
grant execute on function public.one_on_one_action(uuid,text,text,jsonb), public.one_on_one_settle(public.one_on_one_matches,uuid),
  public.one_on_one_expire(), public.one_on_one_forget(uuid) to service_role;
select cron.schedule('one-on-one-expire', '*/5 * * * *', 'select public.one_on_one_expire()');

commit;
