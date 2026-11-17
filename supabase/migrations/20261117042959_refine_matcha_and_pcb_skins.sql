begin;

-- Refresh the art in place for existing owners and current shop offers.
with art(id,body,layers) as (
  values
    ('std_matcha_cream_06',
      '{"color":"#3A693E","roughness":0.68,"metalness":0,"texture_map":"/assets/skins/std_matcha_cream_06/matcha_frame.png"}'::jsonb,
      '{
        "layer_1_base": {
          "face_colors": {
            "U": "#FFF7DD",
            "D": "#E9C13F",
            "F": "#47A868",
            "B": "#4796CF",
            "L": "#F2944D",
            "R": "#D95A70"
          },
          "center_texture_map": "/assets/skins/std_matcha_cream_06/center_etched.png"
        },
        "layer_2_surface": {
          "opacity": 1,
          "material_type": "matte",
          "roughness": 0.81,
          "metalness": 0,
          "normal_scale": 0,
          "center_bump_map": "/assets/skins/std_matcha_cream_06/center_etched_height.png",
          "center_bump_scale": 0.024
        },
        "layer_3_glow": {
          "enabled": false
        },
        "layer_4_animated_shader": {
          "enabled": false
        }
      }'::jsonb),
    ('epic_pcb_circuit_01',
      '{"color":"#252C36","roughness":0.4,"metalness":0.13}'::jsonb,
      '{
        "layer_1_base": {
          "face_colors": {
            "U": "#E8EDF2",
            "R": "#BE1E2D",
            "F": "#0D8A4E",
            "D": "#D99B06",
            "L": "#D4550A",
            "B": "#1D56B8"
          },
          "texture_replaces_color": true,
          "tile_atlases": {
            "U": "/assets/skins/epic_pcb_circuit_01/board_u.png",
            "R": "/assets/skins/epic_pcb_circuit_01/board_r.png",
            "F": "/assets/skins/epic_pcb_circuit_01/board_f.png",
            "D": "/assets/skins/epic_pcb_circuit_01/board_d.png",
            "L": "/assets/skins/epic_pcb_circuit_01/board_l.png",
            "B": "/assets/skins/epic_pcb_circuit_01/board_b.png"
          }
        },
        "layer_2_surface": {
          "opacity": 1,
          "material_type": "metallic",
          "roughness": 0.43,
          "metalness": 0.13,
          "normal_scale": 0,
          "center_bump_map": "/assets/skins/epic_pcb_circuit_01/chip_height.png",
          "center_bump_scale": 0.055
        },
        "layer_3_glow": {
          "enabled": false
        },
        "layer_4_animated_shader": {
          "enabled": false
        }
      }'::jsonb)
)
update public.shop_skins skin
set appearance = skin.appearance || jsonb_build_object('body',art.body,'layers',art.layers)
from art
where skin.id = art.id;

update public.shop_daily_offers daily
set offers = (
  select jsonb_agg(case when skin.id is null then entry.offer else
    jsonb_set(entry.offer,'{skin,appearance}',skin.appearance,false) end order by entry.position)
  from jsonb_array_elements(daily.offers) with ordinality entry(offer,position)
  left join public.shop_skins skin on skin.id = entry.offer #>> '{skin,id}'
    and skin.id in ('std_matcha_cream_06','epic_pcb_circuit_01')
)
where daily.shop_day >= (now() at time zone 'Asia/Ho_Chi_Minh')::date
  and exists (
    select 1 from jsonb_array_elements(daily.offers) entry(offer)
    where entry.offer #>> '{skin,id}' in ('std_matcha_cream_06','epic_pcb_circuit_01')
  );

commit;
