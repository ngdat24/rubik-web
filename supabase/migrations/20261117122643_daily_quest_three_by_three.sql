begin;

create or replace function public.economy_quest_counts(p_user uuid,p_day date)
returns integer[] language sql stable set search_path = '' as $$
  select array[count(*) filter(where size=2),count(*) filter(where size=3),
    count(*) filter(where size>=4)]::integer[]
  from public.economy_quest_solves where user_id=p_user and quest_day=p_day
$$;

commit;
