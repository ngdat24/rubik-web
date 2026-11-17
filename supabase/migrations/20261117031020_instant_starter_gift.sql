begin;

-- Keep the existing receipt identity so a previously paid v2 gift is not paid twice.
create or replace function public.economy_award_starter(p_user uuid,p_challenge uuid)
returns void language plpgsql security invoker set search_path = '' as $$
declare result jsonb;
begin
  perform public.economy_lock_wallet(p_user);
  if exists(select 1 from public.economy_receipts
    where user_id=p_user and kind='starter' and request_id='v2') then return; end if;
  result:=public.economy_change_balance(p_user,'CB',200,'starter_reward',p_challenge);
  insert into public.economy_receipts(user_id,kind,request_id,payload,result)
    values(p_user,'starter','v2',jsonb_build_object('requiredSolves',0,'policy','signup'),result);
end;
$$;

create or replace function public.economy_signup_starter()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  perform public.economy_award_starter(new.id,null);
  return new;
end;
$$;
revoke all on function public.economy_signup_starter() from public,anon,authenticated;
grant execute on function public.economy_signup_starter() to service_role;

create or replace trigger economy_after_profile_signup after insert on public.profiles
  for each row execute function public.economy_signup_starter();

-- Existing profiles without a starter receipt receive the same one-time gift.
do $$
declare candidate record;
begin
  for candidate in select profile.id from public.profiles profile
    where not exists(select 1 from public.economy_receipts receipt
      where receipt.user_id=profile.id and receipt.kind='starter' and receipt.request_id='v2')
    order by profile.id
  loop
    perform public.economy_award_starter(candidate.id,null);
  end loop;
end;
$$;

commit;
