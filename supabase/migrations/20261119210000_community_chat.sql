begin;

create table public.community_chat (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null,
  message text not null check (char_length(message) between 1 and 300),
  created_at timestamptz not null default now()
);
create index community_chat_expiry on public.community_chat (created_at);
create index community_chat_sender on public.community_chat (user_id, created_at desc);
alter table public.community_chat enable row level security;
revoke all on public.community_chat from public, anon, authenticated;
grant select, insert, delete on public.community_chat to service_role;

create function public.send_community_chat(p_user uuid, p_message text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  sender text;
  sent public.community_chat;
begin
  select p.name into sender
  from public.profiles p
  where p.id = p_user and exists (
    select 1 from auth.identities i where i.user_id = p.id and i.provider = 'google'
  );
  if sender is null then
    raise exception 'chat_profile_required';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('community_chat:' || p_user::text, 0));
  if exists (select 1 from public.community_chat
    where user_id = p_user and created_at > now() - interval '3 seconds') then
    raise exception 'chat_rate_limit';
  end if;
  insert into public.community_chat (user_id, display_name, message)
  values (p_user, sender, p_message) returning * into sent;
  return jsonb_build_object('id', sent.id, 'display_name', sent.display_name,
    'message', sent.message, 'created_at', sent.created_at);
end;
$$;
revoke all on function public.send_community_chat(uuid, text) from public, anon, authenticated;
grant execute on function public.send_community_chat(uuid, text) to service_role;

create extension if not exists pg_cron;
select cron.schedule('community-chat-retention', '*/10 * * * *',
  $$delete from public.community_chat where created_at <= now() - interval '2 days'$$);

commit;
