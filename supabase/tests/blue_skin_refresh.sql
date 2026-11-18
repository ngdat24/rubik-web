-- Run after the blue appearance migration on a development database.
begin;
do $$
begin
 if (select count(*) from public.shop_skins where tier='blue' and appearance->>'design_id' in
 ('rare_carbon_weave_01','rare_natural_wood_02','rare_sandstone_03','rare_geo_hex_04','rare_wave_ripple_06','rare_origami_fold_06','rare_uv_microgroove_07'))<>7 then
  raise exception 'Missing blue skin designs';
 end if;
 if (select name from public.shop_skins where id='rare_denim_fabric_05') is distinct from 'Sóng Nước' then raise exception 'Water ownership ID changed';end if;
 if exists(select from public.shop_skins where id='rare_wave_ripple_06') then raise exception 'Unexpected new collectible';end if;
 if (select appearance->'geometry'->>'sticker_shape' from public.shop_skins where id='rare_sandstone_03') is distinct from 'stone' then raise exception 'Sandstone geometry';end if;
 if exists(select from public.shop_skins where tier='blue' and appearance->>'design_id' is not null and
  (appearance->'layers'->'layer_1_base'->>'center_face')::integer is distinct from 0) then raise exception 'Logo must be on white only';end if;
end $$;
rollback;
