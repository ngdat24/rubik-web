create table public.race_rooms (
  id text primary key check (id ~ '^[a-f0-9]{32}$'),
  owner_id uuid not null references auth.users(id) on delete cascade,
  mode text not null check (mode in ('fullSolve','f2lRush')),
  seed text not null,
  duration_ms integer not null check (duration_ms in (45000,120000)),
  start_ms bigint,
  forfeit uuid,
  players jsonb not null,
  created_at timestamptz not null default now()
);
create index race_rooms_owner_created on public.race_rooms(owner_id,created_at);
alter table public.race_rooms enable row level security;
revoke all on public.race_rooms from public,anon,authenticated;
grant all on public.race_rooms to service_role;

-- Only the authenticated backend calls this RPC. The row lock serializes ready,
-- acknowledgements, retries and forfeits across concurrent Function instances.
create function public.race_action(p_user uuid,p_id text,p_action text,p_payload jsonb default '{}')
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  r public.race_rooms; n bigint; i integer; me jsonb; runs jsonb; k integer;
  player_name text;
begin
  n := floor(extract(epoch from clock_timestamp())*1000)::bigint;
  if p_id !~ '^[a-f0-9]{32}$' then raise exception 'Invalid room'; end if;
  if p_action='create' then
    perform pg_advisory_xact_lock(hashtextextended(p_user::text,11));
    select name into player_name from public.profiles where id=p_user;
    if player_name is null then raise exception 'Set your player name first'; end if;
    if p_payload->>'mode' not in ('fullSolve','f2lRush') or p_payload->>'mode' is null then raise exception 'Invalid mode'; end if;
    if not exists(select 1 from public.race_rooms where id=p_id) then
      if (select count(*) from public.race_rooms where owner_id=p_user and created_at>now()-interval '1 hour')>=3 then raise exception 'Room limit: 3 per hour'; end if;
      insert into public.race_rooms(id,owner_id,mode,seed,duration_ms,players)
      values(p_id,p_user,p_payload->>'mode',p_payload->>'seed',case when p_payload->>'mode'='f2lRush' then 45000 else 120000 end,
        jsonb_build_array(jsonb_build_object('id',p_user,'name',player_name,'ready',false,'runs','[]'::jsonb))) on conflict do nothing;
    end if;
  end if;
  select * into r from public.race_rooms where id=p_id for update;
  n := floor(extract(epoch from clock_timestamp())*1000)::bigint;
  if not found or r.created_at<now()-interval '1 hour' then raise exception 'Room not found or expired'; end if;
  select (ord-1)::integer into i from jsonb_array_elements(r.players) with ordinality as e(p,ord) where p->>'id'=p_user::text;
  if p_action='join' and i is null then
    if r.start_ms is not null or r.forfeit is not null or jsonb_array_length(r.players)>=2 then raise exception 'Room full or started'; end if;
    select name into player_name from public.profiles where id=p_user;
    if player_name is null then raise exception 'Set your player name first'; end if;
    r.players := r.players || jsonb_build_array(jsonb_build_object('id',p_user,'name',player_name,'ready',false,'runs','[]'::jsonb));
    i := 1;
  end if;
  if i is null or (p_action='create' and r.owner_id<>p_user) then raise exception 'Not a room member'; end if;
  me := r.players->i;
  if p_action='ready' and r.start_ms is null and r.forfeit is null then
    r.players := jsonb_set(r.players,array[i::text,'ready'],'true'::jsonb);
    if jsonb_array_length(r.players)=2 and not exists(select 1 from jsonb_array_elements(r.players) p where p->>'ready'<>'true') then r.start_ms := n; end if;
  elsif p_action='cube_done' then
    runs := me->'runs'; k := (p_payload->'run'->>'k')::integer;
    if k<jsonb_array_length(runs) and runs->k=p_payload->'run' then
      return jsonb_build_object('room',to_jsonb(r),'now_ms',n);
    end if;
    if k<>jsonb_array_length(runs) or k>=1000 or r.forfeit is not null or r.start_ms is null
      or n<r.start_ms+18000 or n>=r.start_ms+21000+r.duration_ms
      or (p_payload->'run'->>'endT')::bigint>least(r.duration_ms,n-r.start_ms-18000+250)
      then raise exception 'Out of order, conflicting retry or deadline exceeded'; end if;
    r.players := jsonb_set(r.players,array[i::text,'runs'],runs||jsonb_build_array(p_payload->'run'));
  elsif p_action='forfeit' and r.forfeit is null and (r.start_ms is null or n<r.start_ms+21000+r.duration_ms) then
    r.forfeit := p_user;
  elsif p_action not in ('create','join','get','ready','forfeit') then
    raise exception 'Invalid action';
  end if;
  if p_action<>'get' then
    update public.race_rooms set players=r.players,start_ms=r.start_ms,forfeit=r.forfeit where id=p_id;
  end if;
  return jsonb_build_object('room',to_jsonb(r),'now_ms',n);
end;
$$;
revoke all on function public.race_action(uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.race_action(uuid,text,text,jsonb) to service_role;
