import type {CloudAccount} from './account.js';
import {championAwards} from './champion-account.js';
import type {ChampionSize} from './champion-design.js';

export const championPreferenceKey=(user:string|undefined,size:ChampionSize)=>`rubik.champion.equipped.${user}.${size}`;

/** Preferences select a skin; server awards remain the source of ownership. Never mutate either here. */
export async function loadEquippedChampion(account:CloudAccount,size:ChampionSize){
  try{if(localStorage.getItem(championPreferenceKey(account.id,size))!=='1')return;}catch{return;}
  const award=(await championAwards(account)).find(row=>row.size===size&&row.variant);
  if(!award?.variant)return;
  const style=await import('./champion-design.js'),design=await style.loadChampionDesign(size);
  return {options:style.championRendererOptions(design,'borderless',size),name:award.name,sound:design.interaction_fx.sound_file};
}
