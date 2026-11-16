-- Separate from legacy race_rooms: old deployed clients and Time Limit keep
-- their protocol while the reusable lobby UI is reviewed on Preview.
create table public.race_lobbies (
  id text primary key check(id ~ '^[A-Z0-9]{8}$'),
  owner_id uuid not null references auth.users(id) on delete cascade,
  mode text not null default 'fullSolve' check(mode in ('fullSolve','f2lRush','oneFace')),
  next_mode text not null default 'fullSolve' check(next_mode in ('fullSolve','f2lRush','oneFace')),
  seed text not null,
  round_id text not null default replace(gen_random_uuid()::text,'-',''),
  duration_ms integer not null default 180000 check(duration_ms=180000),
  start_ms bigint,
  forfeit uuid,
  players jsonb not null check(jsonb_array_length(players) between 1 and 2),
  expires_ms bigint not null,
  created_at timestamptz not null default now()
);
create index race_lobbies_expiry on public.race_lobbies(expires_ms);
create index race_lobbies_owner on public.race_lobbies(owner_id);
alter table public.race_lobbies enable row level security;
revoke all on public.race_lobbies from public,anon,authenticated;
grant all on public.race_lobbies to service_role;

create function public.lobby_action(p_user uuid,p_code text,p_action text,p_payload jsonb default '{}')
returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.race_lobbies; n bigint; i integer; j integer; me jsonb; p jsonb;
  name text; runs jsonb; k integer; live jsonb; old_live jsonb;
  finished boolean; fresh boolean:=false; client text:=p_payload->>'client';
begin
  n:=floor(extract(epoch from clock_timestamp())*1000)::bigint;
  if p_code !~ '^[A-Z0-9]{8}$' or client is null or client !~ '^[a-f0-9]{32}$' then raise exception 'Invalid room'; end if;
  if p_action='create' then
    perform pg_advisory_xact_lock(hashtextextended(p_user::text,14));
    -- Expired rows are logically closed even when nobody is polling them.
    delete from public.race_lobbies where expires_ms<=n;
    select pr.name into name from public.profiles pr where pr.id=p_user;
    if name is null then raise exception 'Set your player name first'; end if;
    if p_payload->>'mode' is null or p_payload->>'mode' not in ('fullSolve','f2lRush','oneFace') then raise exception 'Invalid mode'; end if;
    if not exists(select 1 from public.race_lobbies where id=p_code) then
      if (select count(*) from public.race_lobbies where owner_id=p_user)>=3 then raise exception 'Room limit'; end if;
      insert into public.race_lobbies(id,owner_id,mode,next_mode,seed,players,expires_ms)
      values(p_code,p_user,p_payload->>'mode',p_payload->>'mode',p_payload->>'seed',
        jsonb_build_array(jsonb_build_object('id',p_user,'name',name,'client',client,'present',true,'until',n+90000,'ready',false,'rematch',false,'runs','[]'::jsonb)),n+90000)
      on conflict do nothing;
    end if;
  end if;
  select * into r from public.race_lobbies where id=p_code for update;
  if not found then raise exception 'Room not found'; end if;
  n:=floor(extract(epoch from clock_timestamp())*1000)::bigint;
  for j in 0..jsonb_array_length(r.players)-1 loop
    p:=r.players->j;
    if (p->>'present')::boolean and (p->>'until')::bigint<=n then
      r.players:=jsonb_set(r.players,array[j::text],p||'{"present":false,"ready":false,"rematch":false}'::jsonb);
      if r.start_ms is not null and (p->>'until')::bigint<r.start_ms+201000 and r.forfeit is null then r.forfeit:=(p->>'id')::uuid; end if;
    end if;
  end loop;
  if not exists(select 1 from jsonb_array_elements(r.players) e where (e->>'present')::boolean) then
    delete from public.race_lobbies where id=p_code;
    return jsonb_build_object('gone',true,'now_ms',n);
  end if;
  finished:=r.forfeit is not null or (r.start_ms is not null and n>=r.start_ms+201000);
  select (e.ord-1)::integer into i from jsonb_array_elements(r.players) with ordinality e(p,ord) where e.p->>'id'=p_user::text;
  if p_action='create' and (r.owner_id<>p_user or r.players->0->>'client'<>client) then raise exception 'Room code collision'; end if;
  if p_action='join' and (i is null or not (r.players->i->>'present')::boolean) then
    if (select count(*) from jsonb_array_elements(r.players) e where (e->>'present')::boolean)>=2 then raise exception 'Room full'; end if;
    if r.start_ms is not null and not finished then raise exception 'Round running'; end if;
    select pr.name into name from public.profiles pr where pr.id=p_user;
    if name is null then raise exception 'Set your player name first'; end if;
    select jsonb_agg(e) into r.players from jsonb_array_elements(r.players) e where (e->>'present')::boolean;
    r.players:=r.players||jsonb_build_array(jsonb_build_object('id',p_user,'name',name,'client',client,'present',true,'until',n+90000,'ready',false,'rematch',false,'runs','[]'::jsonb));
    i:=jsonb_array_length(r.players)-1;fresh:=true;
  end if;
  if i is null then raise exception 'Not a room member'; end if;
  me:=r.players->i;
  if p_action='join' then me:=me||jsonb_build_object('client',client); end if;
  if me->>'client'<>client then
    if p_action='leave' then return jsonb_build_object('room',to_jsonb(r),'now_ms',n); end if;
    raise exception 'Connection replaced';
  end if;
  if not (me->>'present')::boolean then raise exception 'Not a room member'; end if;
  if p_action not in ('create','join','get','leave') and (p_payload->>'round' is null or p_payload->>'round'<>r.round_id) then raise exception 'Round changed'; end if;
  me:=me||jsonb_build_object('until',n+90000);
  r.players:=jsonb_set(r.players,array[i::text],me);
  if p_action='leave' then
    if coalesce((p_payload->>'depart')::boolean,false) then
      r.players:=jsonb_set(r.players,array[i::text,'until'],to_jsonb(n+5000));
    else
      r.players:=jsonb_set(r.players,array[i::text],me||'{"present":false,"ready":false,"rematch":false}'::jsonb);
      if r.start_ms is not null and not finished and r.forfeit is null then r.forfeit:=p_user; end if;
    end if;
  elsif p_action='mode' then
    if r.start_ms is not null and not finished then raise exception 'Round running'; end if;
    if p_payload->>'mode' is null or p_payload->>'mode' not in ('fullSolve','f2lRush','oneFace') then raise exception 'Invalid mode'; end if;
    if r.next_mode<>p_payload->>'mode' then
      r.next_mode:=p_payload->>'mode';
      select jsonb_agg(e||'{"ready":false,"rematch":false}'::jsonb) into r.players from jsonb_array_elements(r.players) e;
      if r.start_ms is null then fresh:=true; end if;
    end if;
  elsif p_action='ready' then
    if r.start_ms is not null or r.forfeit is not null or p_payload->>'mode' is distinct from r.mode then raise exception 'Round changed'; end if;
    r.players:=jsonb_set(r.players,array[i::text,'ready'],'true'::jsonb);
    if jsonb_array_length(r.players)=2 and not exists(select 1 from jsonb_array_elements(r.players) e where not (e->>'present')::boolean or not (e->>'ready')::boolean) then r.start_ms:=n; end if;
  elsif p_action='rematch' then
    if not finished or p_payload->>'mode' is distinct from r.next_mode then raise exception 'Round changed'; end if;
    r.players:=jsonb_set(r.players,array[i::text,'rematch'],'true'::jsonb);
    if jsonb_array_length(r.players)=2 and not exists(select 1 from jsonb_array_elements(r.players) e where not (e->>'present')::boolean or not (e->>'rematch')::boolean) then
      fresh:=true;r.start_ms:=n;
    end if;
  elsif p_action='cube_done' then
    runs:=me->'runs';k:=(p_payload->'run'->>'k')::integer;
    if k<jsonb_array_length(runs) and runs->k=p_payload->'run' then null;
    else
      if k is null or k<>jsonb_array_length(runs) or k>=1000 or r.forfeit is not null or r.start_ms is null
        or n<r.start_ms+18000 or n>=r.start_ms+201000
        or (p_payload->'run'->>'endT')::bigint>least(180000,n-r.start_ms-18000+250) then raise exception 'Late result'; end if;
      r.players:=jsonb_set(r.players,array[i::text,'runs'],runs||jsonb_build_array(p_payload->'run'));
    end if;
  elsif p_action='progress' then
    live:=p_payload->'live';k:=(live->>'k')::integer;old_live:=me->'live';
    if k is null or k<0 or k>=1000 or jsonb_typeof(live->'state') is distinct from 'array' or jsonb_array_length(live->'state')<>54
      or (live->>'preCount')::integer not between 0 and 200 or (live->>'moveCount')::integer not between 0 and 4000 then raise exception 'Invalid progress'; end if;
    if k=jsonb_array_length(me->'runs') and r.forfeit is null and r.start_ms is not null and n>=r.start_ms+3000 and n<r.start_ms+198000 then
      if old_live is null or (old_live->>'k')::integer<>k or ((live->>'preCount')::integer>=(old_live->>'preCount')::integer and (live->>'moveCount')::integer>=(old_live->>'moveCount')::integer) then
        if old_live->'k'=live->'k' and old_live->'preCount'=live->'preCount' and old_live->'moveCount'=live->'moveCount' and old_live->'state'<>live->'state' then raise exception 'Conflicting progress'; end if;
        r.players:=jsonb_set(r.players,array[i::text,'live'],live||jsonb_build_object('updatedAt',n));
      end if;
    end if;
  elsif p_action not in ('create','join','get') then raise exception 'Invalid action'; end if;
  if fresh then
    r.round_id:=replace(gen_random_uuid()::text,'-','');r.mode:=r.next_mode;r.seed:=p_payload->>'seed';r.forfeit:=null;
    if p_action<>'rematch' then r.start_ms:=null; end if;
    select jsonb_agg((e-'live')||jsonb_build_object('ready',p_action='rematch','rematch',false,'runs','[]'::jsonb)) into r.players from jsonb_array_elements(r.players) e;
  end if;
  select max((e->>'until')::bigint) into r.expires_ms from jsonb_array_elements(r.players) e where (e->>'present')::boolean;
  if r.expires_ms is null then
    delete from public.race_lobbies where id=p_code;return jsonb_build_object('gone',true,'now_ms',n);
  end if;
  update public.race_lobbies set mode=r.mode,next_mode=r.next_mode,seed=r.seed,round_id=r.round_id,start_ms=r.start_ms,forfeit=r.forfeit,players=r.players,expires_ms=r.expires_ms where id=p_code;
  return jsonb_build_object('room',to_jsonb(r),'now_ms',n);
end;
$$;
revoke all on function public.lobby_action(uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.lobby_action(uuid,text,text,jsonb) to service_role;
