begin;

-- Channels are stored in engine face order U R F D L B.
create table public.skin_palettes (
  id text primary key check (id ~ '^[a-z0-9_-]{1,80}$'),
  name text not null,
  colors integer[] not null check (
    cardinality(colors) = 6 and array_position(colors, null) is null
    and 0 <= all(colors) and 16777215 >= all(colors)
  )
);

create table public.owned_skins (
  user_id uuid references public.profiles(id) on delete cascade,
  skin_id text references public.skin_palettes(id),
  primary key (user_id,skin_id)
);

create table public.equipped_skins (
  user_id uuid primary key,
  skin_id text not null,
  foreign key (user_id,skin_id) references public.owned_skins(user_id,skin_id) on delete cascade
);

alter table public.skin_palettes enable row level security;
alter table public.owned_skins enable row level security;
alter table public.equipped_skins enable row level security;
revoke all on public.skin_palettes, public.owned_skins, public.equipped_skins from public, anon, authenticated;
grant select, insert, update, delete on public.skin_palettes, public.owned_skins, public.equipped_skins to service_role;

insert into public.skin_palettes(id,name,colors) values
  ('std_matte_pastel_01','Pastel Nhám Tiêu Chuẩn',array[16317180,16281969,4906624,16638023,16486972,6333946]),
  ('std_glossy_classic_02','Nhựa Bóng Cổ Điển',array[16777215,12124160,39752,16766208,16734464,17837]),
  ('std_white_frame_03','Khung Trắng Tinh Khôi',array[14870768,15680580,2278750,16436245,16347926,2450411]),
  ('std_retro_90s_04','Hoài Cổ Thập Niên 90',array[16708551,10033947,1409085,14251782,12730636,1920728]),
  ('std_high_contrast_05','Tương Phản Tốc Độ',array[16777215,16716083,65382,16707722,16742144,35071]),
  ('std_matcha_cream_06','Kem Matcha Dịu Mắt',array[16446975,16557477,7268279,16639626,16628340,9684477]),
  ('std_primary_teal_07','Xanh Ngọc Lục Bảo',array[16317180,14753096,1357990,16436245,16347926,5195493]),
  ('std_slate_frame_08','Khung Xám Khói',array[16777215,14427686,1483594,15381256,15357964,2450411]);

create function public.skin_inventory(p_user uuid,p_equip boolean,p_skin text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare equipped text; catalogue jsonb;
begin
  if not exists(select 1 from public.profiles where id=p_user) then raise exception 'profile_required'; end if;
  if p_equip and p_skin is null then
    delete from public.equipped_skins where user_id=p_user;
  elsif p_equip then
    begin
      insert into public.equipped_skins(user_id,skin_id) values(p_user,p_skin)
        on conflict (user_id) do update set skin_id=excluded.skin_id;
    exception when foreign_key_violation then raise exception 'skin_not_owned';
    end;
  end if;
  select skin_id into equipped from public.equipped_skins where user_id=p_user;
  select coalesce(jsonb_agg(jsonb_build_object('id',skin.id,'name',skin.name,'colors',skin.colors,
    'owned',owned.skin_id is not null) order by skin.id), '[]') into catalogue
    from public.skin_palettes skin left join public.owned_skins owned on owned.skin_id=skin.id and owned.user_id=p_user;
  return jsonb_build_object('equipped',equipped,'skins',catalogue);
end;
$$;

revoke all on function public.skin_inventory(uuid,boolean,text) from public, anon, authenticated;
grant execute on function public.skin_inventory(uuid,boolean,text) to service_role;

commit;
