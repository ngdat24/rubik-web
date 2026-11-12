begin;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 30 and name = btrim(name)),
  created_at timestamptz not null default now()
);
create unique index profiles_name_unique on public.profiles (lower(name));

create table public.solves (
  id text primary key check (char_length(id) between 1 and 100),
  user_id uuid not null references auth.users(id) on delete cascade,
  solve jsonb not null,
  size smallint not null check (size between 2 and 10),
  time_ms bigint check (time_ms >= 0),
  ranked boolean not null default false,
  penalty_override text check (penalty_override in ('none','+2','DNF')),
  deleted boolean not null default false,
  revision bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index solves_user_id on public.solves (user_id, id);
create index solves_best on public.solves (user_id, size, time_ms) where ranked and not deleted and time_ms is not null;

alter table public.profiles enable row level security;
alter table public.solves enable row level security;
revoke all on public.profiles, public.solves from anon, authenticated;
grant select on public.profiles, public.solves to authenticated;
grant all on public.profiles, public.solves to service_role;
create policy profiles_read_own on public.profiles for select to authenticated using ((select auth.uid()) = id);
create policy solves_read_own on public.solves for select to authenticated using ((select auth.uid()) = user_id);

create table public.api_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  window_start timestamptz not null,
  used integer not null,
  primary key (user_id, kind)
);
alter table public.api_usage enable row level security;
revoke all on public.api_usage from anon, authenticated;
grant all on public.api_usage to service_role;

create function public.consume_quota(p_user uuid, p_kind text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare count_used integer;
begin
  insert into public.api_usage as usage(user_id,kind,window_start,used)
    values(p_user,p_kind,now(),1)
    on conflict(user_id,kind) do update set
      used = case when usage.window_start <= now()-interval '1 minute' then 1 else usage.used+1 end,
      window_start = case when usage.window_start <= now()-interval '1 minute' then now() else usage.window_start end
    returning used into count_used;
  return count_used <= case when p_kind='write' then 120 else 600 end;
end;
$$;

create function public.save_solve(p_user uuid, p_solve jsonb, p_override text, p_deleted boolean, p_ranked boolean, p_expected bigint default null)
returns setof public.solves language plpgsql security definer set search_path = '' as $$
declare previous public.solves; effective_time bigint; result public.solves;
begin
  -- One account's concurrent imports cannot bypass the record limit.
  perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
  select * into previous from public.solves where id=p_solve->>'id' for update;
  if found then
    if previous.user_id <> p_user or previous.solve <> p_solve then
      raise exception 'Solve ID conflict' using errcode='23505';
    end if;
    if previous.penalty_override is not distinct from p_override and previous.deleted=p_deleted then
      return next previous; return;
    end if;
    if p_expected is distinct from previous.revision then
      raise exception 'Revision conflict' using errcode='40001';
    end if;
    update public.solves set penalty_override=p_override, deleted=p_deleted,
      revision=revision+1,updated_at=clock_timestamp() where id=previous.id returning * into result;
  else
    if p_expected is not null then raise exception 'Missing original' using errcode='40001'; end if;
    if (select count(*) from public.solves where user_id=p_user)>=10000 then
      raise exception 'History limit reached' using errcode='54000';
    end if;
    effective_time=case when p_solve->>'penalty'='DNF' then null else (p_solve->>'timeMs')::bigint+case when p_solve->>'penalty'='+2' then 2000 else 0 end end;
    insert into public.solves(id,user_id,solve,size,time_ms,ranked,penalty_override,deleted)
      values(p_solve->>'id',p_user,p_solve,(p_solve->>'size')::smallint,effective_time,p_ranked,p_override,p_deleted) returning * into result;
  end if;
  return next result;
end;
$$;

create function public.leaderboard(p_size integer)
returns table(id uuid, name text, "timeMs" bigint)
language sql stable security definer set search_path = '' as $$
  select p.id,p.name,min(s.time_ms) as best
  from public.profiles p join public.solves s on s.user_id=p.id
  where p_size in (2,3) and s.size=p_size and s.ranked and not s.deleted and s.time_ms is not null
  group by p.id,p.name order by best,p.name,p.id limit 100;
$$;

revoke all on function public.consume_quota(uuid,text) from public,anon,authenticated;
revoke all on function public.save_solve(uuid,jsonb,text,boolean,boolean,bigint) from public,anon,authenticated;
revoke all on function public.leaderboard(integer) from public,anon,authenticated;
grant execute on function public.consume_quota(uuid,text) to service_role;
grant execute on function public.save_solve(uuid,jsonb,text,boolean,boolean,bigint) to service_role;
grant execute on function public.leaderboard(integer) to service_role;
commit;
