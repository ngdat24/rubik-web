begin;

-- Fixed request-time cutoff; this is a one-off gift, not a signup reward.
do $$
declare candidate record; reward jsonb;
begin
  for candidate in select id from public.profiles
    where created_at <= timestamptz '2026-11-17 11:31:51+00' order by id
  loop
    perform public.economy_lock_wallet(candidate.id);
    if exists(select 1 from public.economy_receipts where user_id=candidate.id
      and kind='community_gift' and request_id='20261117_existing_5000cb') then continue; end if;
    -- Grant the full requested amount even if the regular earning cap is reached.
    reward:=public.economy_change_balance(candidate.id,'CB',5000,'community_gift_20261117',null,true);
    insert into public.economy_receipts(user_id,kind,request_id,payload,result)
      values(candidate.id,'community_gift','20261117_existing_5000cb',
        jsonb_build_object('cutoff','2026-11-17T11:31:51Z','amount',5000),reward);
  end loop;
end;
$$;

commit;
