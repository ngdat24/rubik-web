create function public.leaderboard_top1000(p_size integer)
returns table(id uuid, name text, "timeMs" bigint, nameplate text)
language sql stable security invoker set search_path = '' as $$
 select b.id,b.name,b.time_ms,public.shop_nameplate(b.id)
 from (
  select p.id,p.name,s.time_ms,s.id as solve_id
  from public.solves s join public.profiles p on p.id=s.user_id
  where p_size in (2,3) and s.size=p_size and s.ranked and not s.deleted and s.time_ms is not null
  order by s.time_ms,p.name,p.id,s.id limit 1000
 ) b order by b.time_ms,b.name,b.id,b.solve_id;
$$;
revoke all on function public.leaderboard_top1000(integer) from public,anon,authenticated;
grant execute on function public.leaderboard_top1000(integer) to service_role;
