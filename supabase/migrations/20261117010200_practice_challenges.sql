begin;

create table public.practice_challenges (
  id uuid primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  seed text not null unique check (seed ~ '^[0-9a-f]{64}$'),
  size smallint not null check (size between 2 and 10),
  issued_at timestamptz not null default clock_timestamp(),
  completed_at timestamptz,
  solve jsonb,
  solve_id text,
  move_count integer check (move_count >= 0),
  effective_ms bigint check (effective_ms >= 0),
  eligible boolean,
  unique(user_id,solve_id),
  check ((solve_id is null) = (completed_at is null) and (solve is null) = (completed_at is null)),
  check ((move_count is null) = (completed_at is null) and (effective_ms is null) = (completed_at is null)
    and (eligible is null) = (completed_at is null))
);
create index practice_challenges_player_completions on public.practice_challenges(user_id,completed_at)
  where completed_at is not null;

alter table public.practice_challenges enable row level security;
revoke all on public.practice_challenges from public, anon, authenticated;
grant select, insert, update, delete on public.practice_challenges to service_role;

create function public.practice_issue(p_user uuid,p_id uuid,p_seed text,p_size smallint)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare challenge public.practice_challenges;
begin
  if not exists(select 1 from public.profiles where id=p_user) then raise exception 'profile_required'; end if;
  insert into public.practice_challenges(id,user_id,seed,size) values(p_id,p_user,p_seed,p_size)
    returning * into challenge;
  return jsonb_build_object('id',challenge.id,'seed',challenge.seed,'size',challenge.size,'scrambleIndex',0);
end;
$$;

-- Called after server replay verification. Only this receipt can later qualify
-- for rewards; importing or changing history does not write to this table.
create function public.practice_finish(p_user uuid,p_id uuid,p_solve jsonb,p_moves integer,p_effective_ms bigint,p_eligible boolean)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare challenge public.practice_challenges;
begin
  select * into challenge from public.practice_challenges
    where id=p_id and user_id=p_user for update;
  if not found
    or p_solve->>'seed' is distinct from challenge.seed
    or p_solve->>'size' is distinct from challenge.size::text
    or p_solve->>'scrambleIndex' is distinct from '0'
    or p_solve->>'scrambleSource' is distinct from 'generated'
    or coalesce(p_solve->>'penalty','') not in ('none','+2')
    or coalesce(length(p_solve->>'id'),0) not between 1 and 100
  then raise exception 'challenge_mismatch'; end if;
  if challenge.completed_at is not null then
    if challenge.solve is distinct from p_solve then raise exception 'challenge_used'; end if;
  else
    update public.practice_challenges set solve_id=p_solve->>'id',solve=p_solve,completed_at=clock_timestamp(),
      move_count=p_moves,effective_ms=p_effective_ms,eligible=p_eligible
      where id=challenge.id returning * into challenge;
  end if;
  return jsonb_build_object('id',challenge.id,'solveId',challenge.solve_id,'completedAt',challenge.completed_at,'eligible',challenge.eligible);
exception when unique_violation then raise exception 'challenge_used';
end;
$$;

revoke all on function public.practice_issue(uuid,uuid,text,smallint), public.practice_finish(uuid,uuid,jsonb,integer,bigint,boolean)
  from public, anon, authenticated;
grant execute on function public.practice_issue(uuid,uuid,text,smallint), public.practice_finish(uuid,uuid,jsonb,integer,bigint,boolean)
  to service_role;

commit;
