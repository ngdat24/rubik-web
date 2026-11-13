create or replace function public.leaderboard(p_size integer)
returns table(id uuid, name text, "timeMs" bigint)
language sql stable security invoker set search_path = '' as $$
  select p.id,p.name,s.time_ms
  from public.solves s join public.profiles p on p.id=s.user_id
  where p_size in (2,3) and s.size=p_size and s.ranked and not s.deleted and s.time_ms is not null
  order by s.time_ms,p.name,p.id,s.id limit 10;
$$;
