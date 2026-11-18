begin;

-- Fixed request-time cutoff; this is a one-off gift, not a signup reward.
do $$
declare candidate record; reward jsonb;
begin
  for candidate in select id from public.profiles
    where created_at <= timestamptz '2026-11-18 17:04:43.976031+00' order by id
  loop
    perform public.economy_lock_wallet(candidate.id);
    if exists(select 1 from public.economy_receipts where user_id=candidate.id
      and kind='community_gift' and request_id='20261119_existing_5zn') then continue; end if;
    -- Grant the full requested amount even if the regular earning cap is reached.
    reward:=public.economy_change_balance(candidate.id,'ZN',5,'community_gift_20261119_zn',null,true);
    insert into public.economy_receipts(user_id,kind,request_id,payload,result)
      values(candidate.id,'community_gift','20261119_existing_5zn',
        jsonb_build_object('cutoff','2026-11-18T17:04:43.976031Z','amount',5),reward);
  end loop;
end;
$$;

commit;
