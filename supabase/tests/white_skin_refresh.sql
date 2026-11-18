begin;
do $$ begin
 if (select count(*) from public.shop_skins where tier='white' and appearance->'geometry' is not null)<>7 then raise exception 'White skin count';end if;
 if (select name from public.shop_skins where id='std_matcha_cream_06')<>'Kem Matcha' then raise exception 'Matcha name';end if;
 if (select name from public.shop_skins where id='std_matte_pastel_01')<>'Phấn Nhám' then raise exception 'Chalk name';end if;
 if not (select (appearance->'geometry'->>'borderless')::boolean from public.shop_skins where id='std_glossy_classic_02') then raise exception 'Porcelain frame';end if;
 if exists(select from public.shop_skins where appearance->'geometry' is not null and (shop_price<>300 or shop_currency<>'CB')) then raise exception 'Price changed';end if;
end $$;
rollback;
