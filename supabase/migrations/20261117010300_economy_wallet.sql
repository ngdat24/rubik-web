begin;

create table public.user_wallets (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  cubit_balance bigint not null default 0 check (cubit_balance >= 0),
  zenith_balance bigint not null default 0 check (zenith_balance >= 0),
  shop_seed uuid not null default gen_random_uuid(),
  updated_at timestamptz not null default now()
);

create table public.currency_ledger (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.user_wallets(user_id) on delete cascade,
  currency_type text not null check (currency_type in ('CB','ZN')),
  amount bigint not null check (amount <> 0),
  reason text not null,
  reference_id uuid,
  created_at timestamptz not null default clock_timestamp()
);
create index economy_ledger_by_wallet on public.currency_ledger(user_id,reason,created_at);

-- The receipt includes the request and its outcome. A zero payout at cap is
-- still processed, so a replay cannot award money after the player spends it.
create table public.economy_receipts (
  user_id uuid references public.user_wallets(user_id) on delete cascade,
  kind text,
  request_id text,
  payload jsonb not null,
  result jsonb not null,
  primary key (user_id,kind,request_id)
);

alter table public.user_wallets enable row level security;
alter table public.currency_ledger enable row level security;
alter table public.economy_receipts enable row level security;
revoke all on public.user_wallets, public.currency_ledger, public.economy_receipts from public, anon, authenticated;
grant select,insert,update,delete on public.user_wallets, public.currency_ledger, public.economy_receipts to service_role;

create function public.economy_lock_wallet(p_user uuid)
returns public.user_wallets language plpgsql security invoker set search_path = '' as $$
declare wallet public.user_wallets;
begin
  if not exists(select 1 from public.profiles where id=p_user) then raise exception 'profile_required'; end if;
  insert into public.user_wallets(user_id) values(p_user) on conflict do nothing;
  select * into strict wallet from public.user_wallets where user_id=p_user for update;
  return wallet;
end;
$$;

-- The wallet lock is the transaction boundary for every balance change.
-- Protected payouts can overflow the cap; later capped credits never confiscate that overflow.
create function public.economy_change_balance(
  p_user uuid,p_currency text,p_amount bigint,p_reason text,p_reference uuid,p_allow_overflow boolean default false
)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare wallet public.user_wallets; previous bigint; next_balance bigint; cap bigint;
begin
  wallet := public.economy_lock_wallet(p_user);
  case p_currency
    when 'CB' then previous:=wallet.cubit_balance; cap:=50000;
    when 'ZN' then previous:=wallet.zenith_balance; cap:=60;
    else raise exception 'invalid_currency';
  end case;
  if p_amount is null or nullif(p_reason,'') is null then raise exception 'invalid_transaction'; end if;
  if p_amount < -previous then raise exception 'insufficient_balance'; end if;
  if p_amount > 0 and not p_allow_overflow then
    next_balance := previous + least(p_amount,greatest(cap-previous,0));
  else next_balance:=previous+p_amount;
  end if;
  if next_balance <> previous then
    if p_currency='CB' then
      update public.user_wallets set cubit_balance=next_balance,updated_at=clock_timestamp() where user_id=p_user;
    else
      update public.user_wallets set zenith_balance=next_balance,updated_at=clock_timestamp() where user_id=p_user;
    end if;
    insert into public.currency_ledger(user_id,currency_type,amount,reason,reference_id)
      values(p_user,p_currency,next_balance-previous,p_reason,p_reference);
  end if;
  return jsonb_build_object('currency',p_currency,'amount',next_balance-previous,'balance',next_balance);
end;
$$;

create function public.economy_wallet_snapshot(p_user uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare wallet public.user_wallets;
begin
  wallet := public.economy_lock_wallet(p_user);
  return jsonb_build_object('cb',wallet.cubit_balance,'zn',wallet.zenith_balance);
end;
$$;

-- Recheck v2 thresholds for receipts created before this migration as well.
create function public.economy_solo_eligible(p_challenge public.practice_challenges)
returns boolean language plpgsql immutable security invoker set search_path = '' as $$
begin
  return coalesce(p_challenge.completed_at is not null and p_challenge.eligible
    and p_challenge.size between 2 and 5
    and p_challenge.move_count >= (array[6,14,35,55])[p_challenge.size-1]
    and p_challenge.effective_ms - case when p_challenge.solve->>'penalty' = '+2' then 2000 else 0 end
      >= (array[1500,3500,15000,35000])[p_challenge.size-1],false);
end;
$$;

create function public.economy_award_solo(p_challenge uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  challenge public.practice_challenges; old_receipt public.economy_receipts;
  reward jsonb; payload jsonb; range_min integer; range_max integer;
  earned_today bigint; today date; daily_start timestamptz; tomorrow timestamptz;
begin
  select * into strict challenge from public.practice_challenges where id=p_challenge;
  if not public.economy_solo_eligible(challenge)
    then raise exception 'ineligible_solo';
  end if;
  perform public.economy_lock_wallet(challenge.user_id);
  payload := jsonb_build_object('challenge',challenge.id,'solve',challenge.solve_id);
  select * into old_receipt from public.economy_receipts
    where user_id=challenge.user_id and kind='solo' and request_id=challenge.id::text;
  if found then
    if old_receipt.payload is distinct from payload then raise exception 'receipt_mismatch'; end if;
    return old_receipt.result;
  end if;

  range_min := (array[18,36,120,220])[challenge.size-1];
  range_max := (array[25,50,180,280])[challenge.size-1];
  today := (challenge.completed_at at time zone 'Asia/Ho_Chi_Minh')::date;
  daily_start := today::timestamp at time zone 'Asia/Ho_Chi_Minh';
  tomorrow := (today+1)::timestamp at time zone 'Asia/Ho_Chi_Minh';
  select coalesce(sum(ledger.amount),0) into earned_today
    from public.practice_challenges earned join public.currency_ledger ledger on ledger.reference_id=earned.id
    where earned.user_id=challenge.user_id and earned.completed_at>=daily_start and earned.completed_at<tomorrow
      and ledger.user_id=challenge.user_id and ledger.reason='solo_solve';
  reward := public.economy_change_balance(challenge.user_id,'CB',
    least(greatest(750-earned_today,0),range_min+floor(random()*(range_max-range_min+1))::integer),'solo_solve',challenge.id);
  insert into public.economy_receipts(user_id,kind,request_id,payload,result)
    values(challenge.user_id,'solo',challenge.id::text,payload,reward);
  return reward;
end;
$$;

create function public.economy_award_starter(p_user uuid,p_challenge uuid)
returns void language plpgsql security invoker set search_path = '' as $$
declare result jsonb;
begin
  perform public.economy_lock_wallet(p_user);
  if exists(select 1 from public.economy_receipts where user_id=p_user and kind='starter' and request_id='v2')
    then return; end if;
  if (select count(*) from (select 1 from public.practice_challenges
    where user_id=p_user and public.economy_solo_eligible(practice_challenges) limit 5) qualifying) <> 5 then return; end if;
  result := public.economy_change_balance(p_user,'CB',200,'starter_reward',p_challenge);
  insert into public.economy_receipts(user_id,kind,request_id,payload,result)
    values(p_user,'starter','v2',jsonb_build_object('requiredSolves',5),result);
end;
$$;

create function public.economy_record_solo()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if not public.economy_solo_eligible(new) then return new; end if;
  perform public.economy_award_solo(new.id);
  perform public.economy_award_starter(new.user_id,new.id);
  return new;
end;
$$;

create trigger economy_solo_received after update of completed_at on public.practice_challenges
  for each row when (old.completed_at is null and new.completed_at is not null and new.eligible is true)
  execute function public.economy_record_solo();

revoke all on function public.economy_lock_wallet(uuid),
  public.economy_change_balance(uuid,text,bigint,text,uuid,boolean),
  public.economy_wallet_snapshot(uuid), public.economy_solo_eligible(public.practice_challenges), public.economy_award_solo(uuid),
  public.economy_award_starter(uuid,uuid), public.economy_record_solo()
  from public, anon, authenticated;
grant execute on function public.economy_lock_wallet(uuid),
  public.economy_change_balance(uuid,text,bigint,text,uuid,boolean),
  public.economy_wallet_snapshot(uuid), public.economy_solo_eligible(public.practice_challenges), public.economy_award_solo(uuid),
  public.economy_award_starter(uuid,uuid), public.economy_record_solo() to service_role;

commit;
