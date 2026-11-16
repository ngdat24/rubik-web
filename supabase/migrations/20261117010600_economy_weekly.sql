begin;

create table public.economy_closed_weeks (
  week_start date primary key,
  closed_at timestamptz not null default clock_timestamp()
);
create table public.economy_weekly_awards (
  week_start date references public.economy_closed_weeks(week_start),
  user_id uuid references public.user_wallets(user_id) on delete cascade,
  size smallint check (size between 2 and 5),
  place integer not null check (place between 1 and 3),
  amount integer not null check (amount between 0 and 5),
  primary key (week_start,user_id,size)
);
create index economy_practice_weekly_times on public.practice_challenges(size,completed_at,effective_ms)
  where completed_at is not null;

alter table public.economy_closed_weeks enable row level security;
alter table public.economy_weekly_awards enable row level security;
revoke all on public.economy_closed_weeks,public.economy_weekly_awards from public,anon,authenticated;
grant select,insert,update,delete on public.economy_closed_weeks,public.economy_weekly_awards to service_role;

create function public.economy_week(p_at timestamptz)
returns date language sql immutable strict set search_path = '' as $$
  select date_trunc('week',p_at at time zone 'Asia/Ho_Chi_Minh')::date
$$;

create function public.economy_ranked_solves(p_size integer,p_week date,p_limit integer)
returns table(place integer,user_id uuid,name text,time_ms bigint,challenge_id uuid)
language sql stable security invoker set search_path = '' as $$
  select row_number() over(order by verified.effective_ms,verified.completed_at,verified.id)::integer,
    verified.user_id,profile.name,verified.effective_ms,verified.id
  from public.practice_challenges verified
  join public.profiles profile on profile.id=verified.user_id
  where verified.size=p_size and (verified.eligible or verified.size>=6)
    and verified.completed_at>=p_week::timestamp at time zone 'Asia/Ho_Chi_Minh'
    and verified.completed_at<(p_week+7)::timestamp at time zone 'Asia/Ho_Chi_Minh'
  order by verified.effective_ms,verified.completed_at,verified.id
  limit p_limit
$$;

create function public.economy_weekly_board(p_size integer,p_previous boolean)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare selected_week date:=public.economy_week(statement_timestamp()); rankings jsonb;
begin
  if p_size not between 2 and 10 then raise exception 'invalid_size'; end if;
  if p_previous then selected_week:=selected_week-7; end if;
  select coalesce(jsonb_agg(jsonb_build_object('rank',entry.place,'name',entry.name,'timeMs',entry.time_ms,
    'rewardZn',award.amount) order by entry.place),'[]') into rankings
    from public.economy_ranked_solves(p_size,selected_week,10) entry
    left join public.economy_weekly_awards award on award.week_start=selected_week
      and award.user_id=entry.user_id and award.size=p_size and award.place=entry.place;
  return jsonb_build_object('weekStart',selected_week,'weekEnd',selected_week+6,
    'rows',rankings,'closed',exists(select 1 from public.economy_closed_weeks closed
      where closed.week_start=selected_week));
end;
$$;

create function public.economy_close_week(p_week date)
returns integer language plpgsql security invoker set search_path = '' as $$
declare award record; changes jsonb; awarded integer:=0;
begin
  if p_week is null or extract(isodow from p_week)<>1 or p_week>=public.economy_week(statement_timestamp())
    then raise exception 'week_not_closed'; end if;
  perform pg_advisory_xact_lock(584027,2);
  insert into public.economy_closed_weeks(week_start) values(p_week) on conflict do nothing;
  if not found then return 0; end if;
  for award in
    select distinct on (ranked.user_id,board.size) ranked.*,board.size
    from generate_series(2,5) board(size)
    cross join lateral public.economy_ranked_solves(board.size,p_week,3) ranked
    order by ranked.user_id,board.size,ranked.place
  loop
    changes:=public.economy_change_balance(award.user_id,'ZN',(array[5,3,1])[award.place],
      'weekly_leaderboard',award.challenge_id);
    insert into public.economy_weekly_awards(week_start,user_id,size,place,amount)
      values(p_week,award.user_id,award.size,award.place,(changes->>'amount')::integer);
    awarded:=awarded+1;
  end loop;
  return awarded;
end;
$$;

create function public.economy_maintain()
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare previous_week date; payouts integer:=0; weeks integer:=0; current_week date:=public.economy_week(statement_timestamp());
begin
  perform pg_advisory_xact_lock(584027,2);
  for previous_week in
    select distinct public.economy_week(verified.completed_at) from public.practice_challenges verified
    where verified.eligible and verified.size between 2 and 5
      and verified.completed_at<current_week::timestamp at time zone 'Asia/Ho_Chi_Minh'
      and not exists(select 1 from public.economy_closed_weeks closed
        where closed.week_start=public.economy_week(verified.completed_at))
    order by 1
  loop
    payouts:=payouts+public.economy_close_week(previous_week);
    weeks:=weeks+1;
  end loop;
  return jsonb_build_object('weeks',weeks,'weeklyAwards',payouts);
end;
$$;

revoke all on function public.economy_week(timestamptz), public.economy_ranked_solves(integer,date,integer),
  public.economy_weekly_board(integer,boolean), public.economy_close_week(date), public.economy_maintain()
  from public,anon,authenticated;
grant execute on function public.economy_week(timestamptz), public.economy_ranked_solves(integer,date,integer),
  public.economy_weekly_board(integer,boolean), public.economy_close_week(date), public.economy_maintain()
  to service_role;
create function public.economy_guard_ranked_completion()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  perform pg_advisory_xact_lock_shared(584027,2);
  new.completed_at:=clock_timestamp();
  return new;
end;
$$;
create trigger economy_before_ranked_completion before update of completed_at on public.practice_challenges
  for each row when (old.completed_at is null and new.completed_at is not null)
  execute function public.economy_guard_ranked_completion();
revoke all on function public.economy_guard_ranked_completion() from public,anon,authenticated;
grant execute on function public.economy_guard_ranked_completion() to service_role;

commit;
