import type {RendererOptions} from '@rubik/renderer';
import {skinPalette,skinSurface} from './skin-effects.js';
import type {Appearance} from './skin-effects.js';

export type ChampionSize = 2|3;
export type ChampionVariant = 'classic'|'borderless';
export interface ChampionClaim {variant:ChampionVariant; name:string}
interface ChampionConfig extends Appearance {
  name:string;
  geometry:{gap_ratio:number;sticker_inset_ratio:number;center_corner_ratio:number};
  interaction_fx:NonNullable<Appearance['interaction_fx']> & {sound_file:string};
  body:NonNullable<Appearance['body']> & {core_magnets:{color:string;gem_color:string};inner_core:{color:string}};
}

export const championAssets='/assets/skins/rank_gold_apex_chrono_01/';
const champion2Assets='/assets/skins/rank_gold_apex_chrono_2x2_01/';
export const championSizeAssets=(size:ChampionSize)=>size===2?champion2Assets:championAssets;
export const championClaimKey=(size:ChampionSize)=>size===2?'rubik.champion.local-claim.2x2.v1':'rubik.champion.local-claim.v1';
export const championFaces=['U','R','F','D','L','B'] as const;

export function readChampionClaim(size:ChampionSize=3):ChampionClaim|undefined {
  try {
    const value:unknown=JSON.parse(localStorage.getItem(championClaimKey(size))??'null');
    if(value&&typeof value==='object'&&'variant' in value&&'name' in value&&
      (value.variant==='classic'||value.variant==='borderless')&&typeof value.name==='string'){
      return {variant:value.variant,name:value.name};
    }
  } catch {/* Browser storage may be disabled in the demo. */}
}

export async function loadChampionDesign(size:ChampionSize=3):Promise<ChampionConfig> {
  const response=await fetch(championAssets+'stickerless.json');
  if(!response.ok)throw Error('Không tải được cấu hình Champion.');
  const design:ChampionConfig=await response.json();
  if(size===2){
    return {...design,name:design.name+' 2×2',interaction_fx:{
      ...design.interaction_fx,trail_effect_id:'trail_champion_dragon',sound_pack_id:'sound_champion_sword',
      sound_file:'' // The 2×2 sword sound is synthesized by champion-motion.
    }};
  }
  return design;
}

export function championRendererOptions(design:ChampionConfig,_variant:ChampionVariant,size:ChampionSize=3):RendererOptions {
  const assets=championSizeAssets(size);
  const appearance:Appearance={...design,body:{...design.body},layers:{
    ...design.layers,
    layer_1_base:{
      ...design.layers!.layer_1_base!,
      tile_atlases:Object.fromEntries(championFaces.map(face=>[face,assets+'borderless_'+face.toLowerCase()+'.png']))
    }
  }};
  const color=(hex:string)=>Number.parseInt(hex.slice(1),16);
  return {
    size,detailSize:size,optimize:true,
    theme:skinPalette(design),
    surface:skinSurface(appearance)!,
    gapRatio:design.geometry.gap_ratio,
    stickerInsetRatio:design.geometry.sticker_inset_ratio,
    centerCornerRatio:design.geometry.center_corner_ratio,
    fillLightIntensity:1.15,
    resinCoreColor:color(design.body.inner_core.color),
    coreGemColor:color(design.body.core_magnets.gem_color),
    coreMagnetColor:color(design.body.core_magnets.color)
  };
}
