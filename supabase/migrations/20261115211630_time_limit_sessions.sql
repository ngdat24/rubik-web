create table public.time_limit_sessions (
  id text primary key check (id ~ '^[a-f0-9]{32}$'),
  user_id uuid not null references auth.users(id) on delete cascade,
  mode text not null check (mode in ('oneFace','f2lRush','fullSolve')),
  seed text not null,
  start_ms bigint not null,
  duration_ms integer not null default 180000 check (duration_ms=180000),
  runs jsonb not null default '[]',
  abandoned boolean not null default false,
  score integer not null default 0 check (score between 0 and 1000),
  last_end_t integer not null default 0 check (last_end_t between 0 and 180000),
  total_moves integer not null default 0 check (total_moves>=0),
  created_at timestamptz not null default now()
);
create index time_limit_user_created on public.time_limit_sessions(user_id,created_at);
create index time_limit_ranking on public.time_limit_sessions(mode,score desc,last_end_t,total_moves,created_at,id) where not abandoned;
alter table public.time_limit_sessions enable row level security;
revoke all on public.time_limit_sessions from public,anon,authenticated;
grant all on public.time_limit_sessions to service_role;

create function public.time_limit_action(p_user uuid,p_id text,p_action text,p_payload jsonb default '{}')
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare r public.time_limit_sessions; n bigint; k integer; cost integer; player_name text;
begin
  n:=floor(extract(epoch from clock_timestamp())*1000)::bigint;
  if p_id !~ '^[a-f0-9]{32}$' then raise exception 'Invalid session'; end if;
  if p_action='create' then
    perform pg_advisory_xact_lock(hashtextextended(p_user::text,12));
    select name into player_name from public.profiles where id=p_user;
    if player_name is null then raise exception 'Set your player name first'; end if;
    if p_payload->>'mode' is null or p_payload->>'mode' not in ('oneFace','f2lRush','fullSolve') then raise exception 'Invalid mode'; end if;
    if not exists(select 1 from public.time_limit_sessions where id=p_id) then
      if (select count(*) from public.time_limit_sessions where user_id=p_user and created_at>now()-interval '1 hour')>=60 then raise exception 'Time Limit start limit'; end if;
      insert into public.time_limit_sessions(id,user_id,mode,seed,start_ms)
      values(p_id,p_user,p_payload->>'mode',p_payload->>'seed',n) on conflict do nothing;
    end if;
  end if;
  select * into r from public.time_limit_sessions where id=p_id for update;
  if not found or r.user_id<>p_user then raise exception 'Session not found'; end if;
  n:=floor(extract(epoch from clock_timestamp())*1000)::bigint;
  if p_action='cube_done' then
    k:=(p_payload->'run'->>'k')::integer;cost:=(p_payload->>'moveCost')::integer;
    if k<jsonb_array_length(r.runs) and r.runs->k=p_payload->'run' then
      null; -- Idempotent ACK, including retries after the grace period.
    else
      if k is null or k<>jsonb_array_length(r.runs) or k>=1000 or cost is null or cost not between 0 and 8000 or r.abandoned
        or n<r.start_ms+18000 or n>=r.start_ms+201000
        or (p_payload->'run'->>'endT')::integer>least(180000,n-r.start_ms-18000+250)
        then raise exception 'Out of order or late result'; end if;
      r.runs:=r.runs||jsonb_build_array(p_payload->'run');r.score:=r.score+1;
      r.last_end_t:=(p_payload->'run'->>'endT')::integer;r.total_moves:=r.total_moves+cost;
      update public.time_limit_sessions set runs=r.runs,score=r.score,last_end_t=r.last_end_t,total_moves=r.total_moves where id=p_id;
    end if;
  elsif p_action='forfeit' then
    if n<r.start_ms+201000 then r.abandoned:=true;update public.time_limit_sessions set abandoned=true where id=p_id;end if;
  elsif p_action not in ('get','create') then raise exception 'Invalid action';
  end if;
  select name into player_name from public.profiles where id=p_user;
  return jsonb_build_object('now_ms',n,'room',jsonb_build_object('id',r.id,'mode',r.mode,'seed',r.seed,'start_ms',r.start_ms,'duration_ms',r.duration_ms,
    'forfeit',case when r.abandoned then p_user else null end,
    'players',jsonb_build_array(jsonb_build_object('id',p_user,'name',player_name,'ready',true,'runs',r.runs))));
end;
$$;
create function public.time_limit_leaderboard(p_mode text)
returns table(id text,name text,score integer,"lastEndT" integer,"totalMoves" integer)
language sql stable security invoker set search_path = '' as $$
  select s.id,p.name,s.score,s.last_end_t,s.total_moves
  from public.time_limit_sessions s join public.profiles p on p.id=s.user_id
  where s.mode=p_mode and not s.abandoned and s.start_ms+201000<=floor(extract(epoch from now())*1000)::bigint
  order by s.score desc,s.last_end_t,s.total_moves,s.created_at,s.id limit 10;
$$;
revoke all on function public.time_limit_action(uuid,text,text,jsonb),public.time_limit_leaderboard(text) from public,anon,authenticated;
grant execute on function public.time_limit_action(uuid,text,text,jsonb),public.time_limit_leaderboard(text) to service_role;
