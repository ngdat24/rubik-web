begin;
create sequence public.solve_sync_version;
alter table public.solves add column sync_version bigint not null default nextval('public.solve_sync_version');
alter table public.solves alter column sync_version drop default;
create index solves_user_sync on public.solves (user_id,sync_version);
revoke all on sequence public.solve_sync_version from public,anon,authenticated;
grant usage on sequence public.solve_sync_version to service_role;

create schema if not exists private;
grant usage on schema private to service_role;
create function private.stamp_solve_sync() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  -- Serialize versions until commit for this account. A later visible cursor
  -- cannot overtake an uncommitted earlier change belonging to the same user.
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text,0));
  new.sync_version=nextval('public.solve_sync_version');
  return new;
end;
$$;
revoke all on function private.stamp_solve_sync() from public,anon,authenticated;
grant execute on function private.stamp_solve_sync() to service_role;
create trigger solves_sync_version before insert or update on public.solves
for each row execute function private.stamp_solve_sync();
commit;
