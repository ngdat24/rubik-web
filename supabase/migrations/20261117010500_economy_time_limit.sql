begin;

create table public.economy_time_limit_tickets (
  session_id text primary key references public.time_limit_sessions(id) on delete cascade,
  user_id uuid not null references public.user_wallets(user_id) on delete cascade,
  ticket_day date not null,
  kind text not null check (kind in ('free_ticket','paid_ticket','practice','insufficient')),
  fee integer not null check (fee in (0,100))
);
create index economy_time_tickets_by_day on public.economy_time_limit_tickets(user_id,ticket_day);

create table public.economy_time_limit_payouts (
  session_id text primary key references public.time_limit_sessions(id) on delete cascade,
  user_id uuid not null references public.user_wallets(user_id) on delete cascade,
  reward_day date not null,
  cb integer not null check (cb between 0 and 205),
  zn integer not null check (zn between 0 and 1)
);
create index economy_time_payouts_by_day on public.economy_time_limit_payouts(user_id,reward_day);
alter table public.economy_time_limit_tickets enable row level security;
alter table public.economy_time_limit_payouts enable row level security;
revoke all on public.economy_time_limit_tickets,public.economy_time_limit_payouts from public,anon,authenticated;
grant select,insert,update,delete on public.economy_time_limit_tickets,public.economy_time_limit_payouts to service_role;

create function public.economy_time_limit_ticket(p_user uuid,p_id text,p_now_ms bigint)
returns public.economy_time_limit_tickets language plpgsql security invoker set search_path = '' as $$
declare
  session public.time_limit_sessions; ticket public.economy_time_limit_tickets;
  wallet public.user_wallets; billed_day date; quota integer; ticket_kind text; ticket_fee integer:=0;
begin
  select * into session from public.time_limit_sessions where user_id=p_user and id=p_id for update;
  if not found or not session.economy_tracked or session.mode<>'fullSolve' then return null; end if;
  select * into ticket from public.economy_time_limit_tickets where session_id=p_id;
  if found then return ticket; end if;
  -- A request before countdown ends never charges. A session that was
  -- abandoned or never reached a confirmed start remains a free practice.
  if session.abandoned or p_now_ms<session.start_ms+3000 or p_now_ms>=session.start_ms+201000 then return null; end if;
  wallet:=public.economy_lock_wallet(p_user);
  billed_day:=public.economy_day(to_timestamp((session.start_ms+3000)/1000.0));
  select count(*) into quota from public.economy_time_limit_tickets
    where user_id=p_user and ticket_day=billed_day and kind in ('free_ticket','paid_ticket');
  if quota=0 then ticket_kind:='free_ticket';
  elsif quota>=3 then ticket_kind:='practice';
  elsif wallet.cubit_balance<100 then ticket_kind:='insufficient';
  else
    ticket_kind:='paid_ticket';
    ticket_fee:=100;
    perform public.economy_change_balance(p_user,'CB',-ticket_fee,'time_limit_ticket',p_id::uuid);
  end if;
  insert into public.economy_time_limit_tickets(session_id,user_id,ticket_day,kind,fee)
    values(p_id,p_user,billed_day,ticket_kind,ticket_fee) returning * into ticket;
  return ticket;
end;
$$;

create function public.economy_time_limit_settle(p_user uuid,p_id text,p_now_ms bigint)
returns public.economy_time_limit_payouts language plpgsql security invoker set search_path = '' as $$
declare
  session public.time_limit_sessions; payout public.economy_time_limit_payouts;
  day_earned date; week_start date; day_zn integer; week_zn integer;
  nominal_cb integer; actual_cb integer; actual_zn integer:=0; change jsonb;
begin
  select * into session from public.time_limit_sessions where user_id=p_user and id=p_id for update;
  if not found or session.abandoned or session.mode<>'fullSolve' or not session.economy_tracked
    or p_now_ms<session.start_ms+201000 then return null; end if;
  if not exists(select 1 from public.economy_time_limit_tickets
    where session_id=p_id and user_id=p_user and kind in ('free_ticket','paid_ticket')) then return null; end if;
  select * into payout from public.economy_time_limit_payouts where session_id=p_id;
  if found then return payout; end if;
  perform public.economy_lock_wallet(p_user);
  day_earned:=public.economy_day(to_timestamp((session.start_ms+198000)/1000.0));
  week_start:=date_trunc('week',day_earned::timestamp)::date;
  select coalesce(sum(zn) filter(where reward_day=day_earned),0),coalesce(sum(zn),0)
    into day_zn,week_zn from public.economy_time_limit_payouts
    where user_id=p_user and reward_day>=week_start and reward_day<week_start+7;
  nominal_cb:=case session.score when 0 then 0 when 1 then 75 when 2 then 145 else 205 end;
  change:=public.economy_change_balance(p_user,'CB',nominal_cb,'time_limit_reward',p_id::uuid);
  actual_cb:=(change->>'amount')::integer;
  if session.score>=2 and day_zn<2 and week_zn<10 then
    change:=public.economy_change_balance(p_user,'ZN',1,'time_limit_reward',p_id::uuid);
    actual_zn:=(change->>'amount')::integer;
  end if;
  insert into public.economy_time_limit_payouts(session_id,user_id,reward_day,cb,zn)
    values(p_id,p_user,day_earned,actual_cb,actual_zn) returning * into payout;
  return payout;
end;
$$;

create or replace function public.time_limit_with_quests(p_user uuid,p_id text,p_action text,p_payload jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare snapshot jsonb; stamp bigint; ticket public.economy_time_limit_tickets; payout public.economy_time_limit_payouts;
begin
  snapshot:=public.time_limit_action(p_user,p_id,p_action,p_payload);
  stamp:=(snapshot->>'now_ms')::bigint;
  ticket:=public.economy_time_limit_ticket(p_user,p_id,stamp);
  payout:=public.economy_time_limit_settle(p_user,p_id,stamp);
  perform public.economy_record_time_limit_quest(p_user,p_id);
  return snapshot || jsonb_build_object('economy',jsonb_build_object(
    'ticket',ticket.kind,'fee',ticket.fee,
    'reward',case when payout.session_id is not null then jsonb_build_object('cb',payout.cb,'zn',payout.zn) end
  ));
end;
$$;

revoke all on function public.economy_time_limit_ticket(uuid,text,bigint),
  public.economy_time_limit_settle(uuid,text,bigint) from public,anon,authenticated;
grant execute on function public.economy_time_limit_ticket(uuid,text,bigint),
  public.economy_time_limit_settle(uuid,text,bigint) to service_role;
commit;
