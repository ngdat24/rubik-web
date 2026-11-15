-- Only server-replayed sticker states reach this RPC. Existing room/result
-- protocol stays compatible with clients deployed before the second viewport.
create function public.race_progress(p_user uuid,p_id text,p_live jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare r public.race_rooms; n bigint; i integer; old_live jsonb; k integer;
begin
  select * into r from public.race_rooms where id=p_id for update;
  if not found or r.created_at<now()-interval '1 hour' then raise exception 'Room not found or expired'; end if;
  n := floor(extract(epoch from clock_timestamp())*1000)::bigint;
  select (ord-1)::integer into i from jsonb_array_elements(r.players) with ordinality as e(p,ord) where p->>'id'=p_user::text;
  if i is null then raise exception 'Not a room member'; end if;
  k := (p_live->>'k')::integer;
  if k<0 or k>=1000 or jsonb_typeof(p_live->'state')<>'array' or jsonb_array_length(p_live->'state')<>54
    or (p_live->>'preCount')::integer not between 0 and 200 or (p_live->>'moveCount')::integer not between 0 and 4000 then raise exception 'Invalid live state'; end if;
  old_live := r.players->i->'live';
  -- A stale in-flight packet cannot reset a newer cube, result or snapshot.
  if k<>jsonb_array_length(r.players->i->'runs') or r.forfeit is not null or r.start_ms is null
    or n<r.start_ms+3000 or n>=r.start_ms+18000+r.duration_ms then
    return jsonb_build_object('room',to_jsonb(r),'now_ms',n);
  end if;
  if (old_live->>'k')::integer=k then
    if (p_live->>'preCount')::integer<(old_live->>'preCount')::integer or (p_live->>'moveCount')::integer<(old_live->>'moveCount')::integer then
      return jsonb_build_object('room',to_jsonb(r),'now_ms',n);
    end if;
    if p_live->'preCount'=old_live->'preCount' and p_live->'moveCount'=old_live->'moveCount' then
      if p_live->'state'<>old_live->'state' then raise exception 'Conflicting live state'; end if;
      return jsonb_build_object('room',to_jsonb(r),'now_ms',n);
    end if;
  end if;
  r.players := jsonb_set(r.players,array[i::text,'live'],p_live||jsonb_build_object('updatedAt',n));
  update public.race_rooms set players=r.players where id=p_id;
  return jsonb_build_object('room',to_jsonb(r),'now_ms',n);
end;
$$;
revoke all on function public.race_progress(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.race_progress(uuid,text,jsonb) to service_role;
