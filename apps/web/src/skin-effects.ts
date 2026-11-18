import {WESTERN_COLORS} from '@rubik/renderer';
import type {ColorTheme, CubeRenderer, CubeSurface} from '@rubik/renderer';

export const skinFxKey='rubik.skin.low-effects';
export function readSkinLowFx():boolean {
  try {
    const value=localStorage.getItem(skinFxKey);
    if(value!==null)return value==='1';
  } catch {/* Fall back to reduced-motion preferences. */}
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
const faceOrder = ['U','R','F','D','L','B'] as const;
type Faces = Partial<Record<typeof faceOrder[number],string>>;
export interface Appearance {
  geometry?:{borderless?:boolean;gap_ratio?:number;sticker_inset_ratio?:number;center_corner_ratio?:number};
  body?:{color:string;roughness:number;metalness:number;texture_map?:string};
  layers?:{
    layer_1_base?:{face_colors:Faces;texture_maps?:Faces|null;texture_replaces_color?:boolean;tile_atlases?:Faces;center_texture_map?:string};
    layer_2_surface?:{material_type:string;roughness:number;metalness:number;opacity:number;normal_map?:string|null;normal_scale:number;center_bump_map?:string;center_bump_scale?:number};
    layer_3_glow?:{enabled:boolean;glow_color:string;emissive_intensity:number;emissive_map?:string|null};
    layer_4_animated_shader?:{enabled:boolean;speed:number;secondary_color:string};
  };
  interaction_fx?:{sound_pack_id:string|null;trail_effect_id:string|null};
}
export const skinLayout=(appearance?:Appearance)=>appearance?.geometry?.borderless
  ? {gapRatio:.018,stickerInsetRatio:0,centerCornerRatio:.28}
  : {gapRatio:.035,stickerInsetRatio:.075,centerCornerRatio:.22};
const hex = (value:string|undefined) => value && /^#[0-9a-f]{6}$/i.test(value) ? Number.parseInt(value.slice(1),16) : undefined;
const scalar = (value:number|undefined, fallback:number, max=1) =>
  typeof value === 'number' && Number.isFinite(value) ? Math.max(0,Math.min(max,value)) : fallback;

export function skinPalette(appearance?:Appearance):ColorTheme {
  const faces = appearance?.layers?.layer_1_base?.face_colors;
  const face = (index:number) => hex(faces?.[faceOrder[index]!]) ?? WESTERN_COLORS[index]!;
  return [face(0),face(1),face(2),face(3),face(4),face(5)];
}
export function skinSurface(appearance?:Appearance):CubeSurface|undefined {
  if (!appearance) return;
  const surface:CubeSurface = {};
  const body = appearance.body, layers = appearance.layers;
  const layer = layers?.layer_2_surface, glow = layers?.layer_3_glow, pulse = layers?.layer_4_animated_shader;
  const base = layers?.layer_1_base;
  const maps = base?.texture_maps;
  if (body) surface.body = {color:hex(body.color) ?? 0x171b19,roughness:scalar(body.roughness,0.7),metalness:scalar(body.metalness,0),...(body.texture_map ? {map:body.texture_map} : {})};
  if (layer) surface.stickers = {
    roughness:scalar(layer.roughness,0.65),metalness:scalar(layer.metalness,0),opacity:scalar(layer.opacity,1),
    normalScale:scalar(layer.normal_scale,0), ...(layer.normal_map ? {normalMap:layer.normal_map} : {}),
    replaceColor:base?.texture_replaces_color === true,
    ...(maps ? {pattern:layer.material_type,maps:faceOrder.map(face=>maps[face])} : {}),
    ...(base?.center_texture_map ? {centerMap:base.center_texture_map} : {}),
    ...(base?.tile_atlases ? {tileAtlases:faceOrder.map(face=>base.tile_atlases?.[face])} : {}),
    ...(layer.center_bump_map ? {centerBumpMap:layer.center_bump_map,centerBumpScale:scalar(layer.center_bump_scale,0)} : {})
  };
  if (glow?.enabled) surface.glow = {color:hex(glow.glow_color) ?? 0,intensity:scalar(glow.emissive_intensity,1,3),
    ...(glow.emissive_map ? {map:glow.emissive_map} : {})};
  if (pulse?.enabled) surface.pulse = {speed:scalar(pulse.speed,1,10),secondary:hex(pulse.secondary_color) ?? 0};
  return surface;
}

const trailStyles:Record<string,{color:string;endColor?:string;duration:number}> = {
  trail_violet_arc:{color:'#8630D9',duration:180},
  trail_solar_flare:{color:'#EAB308',duration:240},
  trail_crimson_plasma:{color:'#FF2A55',endColor:'#FFB703',duration:300}
};
const frequencies:Record<string,number> = {default_click:420,sound_purple_tactile_01:330,sound_maglev_quantum_s1:605};

export function bindSkinEffects(renderer:CubeRenderer, appearance?:Appearance) {
  const canvas = renderer.canvas;
  const container = canvas.parentElement!;
  const mark = document.createElement('span');
  mark.className = 'skin-trail';
  mark.setAttribute('aria-hidden','true');
  container.append(mark);
  const sound = appearance?.interaction_fx?.sound_pack_id;
  const trail = trailStyles[appearance?.interaction_fx?.trail_effect_id ?? ''];
  const clips = new Map<string,HTMLAudioElement>();
  const unavailable = new Set<string>();
  let context:AudioContext|undefined;
  let animation:Animation|undefined;
  let pointer:{id:number;x:number;y:number}|undefined;
  let alternate = false;
  let disposed = false;
  const unlock = () => {
    if (!sound || !Object.hasOwn(frequencies,sound) || !window.AudioContext) return;
    try {
      context ??= new AudioContext();
      if (context.state === 'suspended') void context.resume().catch(()=>{});
    } catch {/* A blocked audio context leaves the cube playable. */}
  };
  const synth = (solved:boolean) => {
    if (disposed || !context || context.state !== 'running' || !sound) return;
    const time = context.currentTime;
    const oscillator = context.createOscillator(), gain = context.createGain();
    const tone = frequencies[sound] ?? 420;
    oscillator.type = 'triangle';
    oscillator.frequency.setValueAtTime(tone*(solved ? 1.5 : alternate ? 1 : 1.17),time);
    oscillator.frequency.exponentialRampToValueAtTime(tone*0.55,time+(solved ? 0.16 : 0.035));
    gain.gain.setValueAtTime(solved ? 0.075 : 0.055,time);
    gain.gain.exponentialRampToValueAtTime(0.001,time+(solved ? 0.22 : 0.045));
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(time);
    oscillator.stop(time+(solved ? 0.24 : 0.05));
  };
  const play = (solved=false) => {
    if (disposed || !sound || !Object.hasOwn(frequencies,sound)) return;
    alternate = !alternate;
    const key = solved ? 'solve_complete' : alternate ? 'turn_01' : 'turn_02';
    if (unavailable.has(key)) {synth(solved);return;}
    let clip = clips.get(key);
    if (!clip) {
      clip = new Audio('/assets/fx/sounds/'+sound+'/'+key+'.mp3');
      clip.volume = 0.35;
      clips.set(key,clip);
    }
    clip.currentTime = 0;
    void clip.play().catch(error=>{
      if (error instanceof DOMException && error.name === 'NotSupportedError') unavailable.add(key);
      if (!(error instanceof DOMException && error.name === 'AbortError')) synth(solved);
    });
  };
  const stroke = (fromX:number,fromY:number,toX:number,toY:number) => {
    if (!trail || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const rect = container.getBoundingClientRect();
    const distance = Math.hypot(toX-fromX,toY-fromY);
    if (distance < 2) return;
    mark.style.left = `${fromX-rect.left}px`;
    mark.style.top = `${fromY-rect.top}px`;
    mark.style.width = `${distance}px`;
    mark.style.background = `linear-gradient(90deg, transparent, ${trail.color}, ${trail.endColor ?? trail.color})`;
    mark.style.transform = `rotate(${Math.atan2(toY-fromY,toX-fromX)}rad)`;
    animation?.cancel();
    animation = mark.animate([{opacity:0.9},{opacity:0}],{duration:trail.duration,fill:'forwards'});
  };
  const start = (event:PointerEvent) => {
    if (trail && event.isPrimary && renderer.pick(event.clientX,event.clientY))
      pointer = {id:event.pointerId,x:event.clientX,y:event.clientY};
  };
  const move = (event:PointerEvent) => {
    if (pointer?.id !== event.pointerId) return;
    stroke(pointer.x,pointer.y,event.clientX,event.clientY);
  };
  const stop = (event:PointerEvent) => {if (pointer?.id === event.pointerId) pointer = undefined;};
  window.addEventListener('pointerdown',unlock,{capture:true});
  window.addEventListener('keydown',unlock,{capture:true});
  canvas.addEventListener('pointerdown',start,{capture:true});
  window.addEventListener('pointermove',move);
  window.addEventListener('pointerup',stop);
  window.addEventListener('pointercancel',stop);
  return {play,dispose:()=>{
    disposed = true;
    window.removeEventListener('pointerdown',unlock,true);
    window.removeEventListener('keydown',unlock,true);
    canvas.removeEventListener('pointerdown',start,true);
    window.removeEventListener('pointermove',move);
    window.removeEventListener('pointerup',stop);
    window.removeEventListener('pointercancel',stop);
    for (const clip of clips.values()) clip.pause();
    if (context) void context.close().catch(()=>{});
    animation?.cancel();
    mark.remove();
  }};
}
