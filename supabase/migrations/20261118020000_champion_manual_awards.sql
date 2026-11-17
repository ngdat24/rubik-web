-- Manual, permanent awards. No shop pool, currency grant or automatic rank award.
create table public.champion_awards (
  user_id uuid not null references public.profiles(id) on delete cascade,
  size smallint not null check (size in (2,3)),
  granted_at timestamptz not null default now(),
  variant text check (variant in ('classic','borderless')),
  name text check (char_length(name) between 1 and 32 and name !~ '[[:cntrl:]]'),
  claimed_at timestamptz,
  primary key (user_id,size),
  check ((variant is null and name is null and claimed_at is null)
    or (variant is not null and name is not null and claimed_at is not null))
);
alter table public.champion_awards enable row level security;
revoke all on public.champion_awards from public,anon,authenticated;

create function public.champion_snapshot(p_user uuid) returns jsonb
language sql security definer set search_path=public as $$
  select jsonb_build_object('awards',coalesce(jsonb_agg(jsonb_build_object(
    'size',size,'variant',variant,'name',name) order by size),'[]'::jsonb))
  from public.champion_awards where user_id=p_user;
$$;

-- Call only from the owner's trusted SQL/service environment after reviewing a recipient.
create function public.champion_grant(p_user uuid,p_size integer) returns jsonb
language plpgsql security definer set search_path=public as $$
begin
  if p_size not in (2,3) or p_size is null then raise exception 'invalid_champion'; end if;
  insert into public.champion_awards(user_id,size) values (p_user,p_size)
    on conflict (user_id,size) do nothing;
  return public.champion_snapshot(p_user);
end;
$$;

create function public.champion_claim(p_user uuid,p_size integer,p_variant text,p_name text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare award public.champion_awards;
begin
  if p_size is null or p_size not in (2,3) or p_variant is null
    or p_variant not in ('classic','borderless') or p_name is null
    or char_length(btrim(p_name)) not between 1 and 32 or p_name ~ '[[:cntrl:]]'
    then raise exception 'invalid_champion'; end if;
  select * into award from public.champion_awards
    where user_id=p_user and size=p_size for update;
  if not found then raise exception 'champion_not_granted'; end if;
  if award.variant is not null then
    -- Retrying the same user's exact choice is idempotent; another choice never overwrites it.
    if award.variant<>p_variant or award.name<>btrim(p_name) then raise exception 'champion_already_claimed'; end if;
  else
    update public.champion_awards set variant=p_variant,name=btrim(p_name),claimed_at=now()
      where user_id=p_user and size=p_size;
  end if;
  return public.champion_snapshot(p_user);
end;
$$;
revoke all on function public.champion_snapshot(uuid),public.champion_grant(uuid,integer),
  public.champion_claim(uuid,integer,text,text) from public,anon,authenticated;
grant execute on function public.champion_snapshot(uuid),public.champion_grant(uuid,integer),
  public.champion_claim(uuid,integer,text,text) to service_role;

create function public.champion_rename(p_user uuid,p_size integer,p_name text,p_reference uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare award public.champion_awards; receipt public.economy_receipts; payload jsonb; result jsonb;
begin
  if p_size is null or p_size not in (2,3) or p_name is null or p_reference is null
    or char_length(btrim(p_name)) not between 1 and 32 or p_name ~ '[[:cntrl:]]'
    then raise exception 'invalid_champion'; end if;
  -- Same lock order as purchases/reset: wallet first, then this award.
  perform public.economy_lock_wallet(p_user);
  payload:=jsonb_build_object('size',p_size,'name',btrim(p_name));
  select * into receipt from public.economy_receipts where user_id=p_user
    and kind='champion_rename' and request_id=p_reference::text;
  if found then
    if receipt.payload is distinct from payload then raise exception 'receipt_mismatch'; end if;
    return public.champion_snapshot(p_user);
  end if;
  select * into award from public.champion_awards where user_id=p_user and size=p_size for update;
  if not found or award.variant is null then raise exception 'champion_not_granted'; end if;
  if award.name=btrim(p_name) then raise exception 'champion_same_name'; end if;
  perform public.economy_change_balance(p_user,'CB',-500,'champion_rename',p_reference);
  update public.champion_awards set name=btrim(p_name) where user_id=p_user and size=p_size;
  result:=public.champion_snapshot(p_user);
  insert into public.economy_receipts(user_id,kind,request_id,payload,result)
    values(p_user,'champion_rename',p_reference::text,payload,result);
  return result;
end;
$$;
revoke all on function public.champion_rename(uuid,integer,text,uuid) from public,anon,authenticated;
grant execute on function public.champion_rename(uuid,integer,text,uuid) to service_role;
