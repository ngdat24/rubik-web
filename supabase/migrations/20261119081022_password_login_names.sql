begin;

create table public.account_login_names (
  user_id uuid primary key references auth.users(id) on delete cascade,
  login_name text not null unique check (login_name ~ '^[a-z0-9_]{3,30}$')
);

create table public.account_login_quota (
  bucket text not null check (bucket ~ '^[0-9a-f]{64}$'),
  window_started timestamptz not null,
  attempts integer not null check (attempts > 0),
  primary key (bucket, window_started)
);
create index account_login_quota_window on public.account_login_quota (window_started);
alter table public.account_login_names enable row level security;
alter table public.account_login_quota enable row level security;
revoke all on public.account_login_names, public.account_login_quota from public, anon, authenticated;
grant select, insert on public.account_login_names to service_role;
grant select, insert, update, delete on public.account_login_quota to service_role;

create function public.claim_account_login_name(p_user uuid, p_name text)
returns text language plpgsql security definer set search_path = '' as $$
declare claimed text;
begin
  if not exists (
    select 1 from auth.users where id=p_user and email_confirmed_at is not null
      and not is_anonymous and nullif(encrypted_password,'') is not null
  ) then raise exception 'confirmed_password_required'; end if;
  insert into public.account_login_names (user_id, login_name) values (p_user, p_name)
    on conflict (user_id) do nothing;
  select login_name into strict claimed from public.account_login_names where user_id=p_user;
  return claimed;
end;
$$;

create function public.account_login_email(p_name text)
returns text language sql stable security definer set search_path = '' as $$
  select auth_user.email from public.account_login_names names
  join auth.users auth_user on auth_user.id=names.user_id
  where names.login_name=p_name and auth_user.email_confirmed_at is not null and not auth_user.is_anonymous
$$;

create function public.consume_account_login_quota(p_ip text, p_name text)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare
  slot timestamptz := date_bin(interval '10 minutes', statement_timestamp(), '2000-01-01 UTC');
  count_ip integer;
  count_name integer;
begin
  delete from public.account_login_quota where window_started < slot - interval '1 hour';
  insert into public.account_login_quota as quota values (p_ip, slot, 1)
    on conflict (bucket, window_started) do update set attempts=quota.attempts+1
    where quota.attempts < 20 returning attempts into count_ip;
  if count_ip is null then return false; end if;
  insert into public.account_login_quota as quota values (p_name, slot, 1)
    on conflict (bucket, window_started) do update set attempts=quota.attempts+1
    where quota.attempts < 10 returning attempts into count_name;
  return count_name is not null;
end;
$$;

revoke all on function public.claim_account_login_name(uuid,text), public.account_login_email(text),
  public.consume_account_login_quota(text,text) from public, anon, authenticated;
grant execute on function public.claim_account_login_name(uuid,text), public.account_login_email(text),
  public.consume_account_login_quota(text,text) to service_role;
commit;
