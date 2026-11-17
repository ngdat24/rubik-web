import {CanvasTexture, Color, SRGBColorSpace, TextureLoader} from 'three';
import type {MeshStandardMaterial, Texture} from 'three';

export interface CubeSurface {
  body?: {color:number; roughness:number; metalness:number};
  stickers?: {
    roughness:number; metalness:number; opacity:number; pattern?:string;
    maps?:readonly (string|undefined)[]; normalMap?:string; normalScale:number;
  };
  glow?: {color:number; intensity:number; map?:string};
  pulse?: {speed:number; secondary:number};
}

function makePattern(type:string, mask=false):CanvasTexture|undefined {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 96;
  const context = canvas.getContext('2d');
  if (!context) return;
  context.fillStyle = mask ? '#000000' : '#ffffff';
  context.fillRect(0,0,96,96);
  if (mask) {
    context.strokeStyle = '#ffffff';
    context.lineWidth = 4;
    context.strokeRect(12,12,72,72);
  } else {
    context.strokeStyle = '#d0d0d0';
    context.lineWidth = type === 'carbon' ? 3 : 1;
    for (let line = -96; line < 192; line += 7) {
      context.beginPath();
      context.moveTo(line,0);
      context.lineTo(type === 'metallic' ? line+2 : line+96,96);
      context.stroke();
    }
    if (type === 'carbon') {
      context.strokeStyle = '#ededed';
      for (let line = -96; line < 192; line += 7) {
        context.beginPath();
        context.moveTo(line,0);
        context.lineTo(line-96,96);
        context.stroke();
      }
    }
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

export class SurfaceMaterials {
  private readonly textures:Texture[] = [];
  private readonly loader = new TextureLoader();
  private readonly secondary = new Color();
  private readonly primary = new Color();
  private disposed = false;

  constructor(
    private readonly surface:CubeSurface,
    body:MeshStandardMaterial,
    private readonly stickers:readonly MeshStandardMaterial[],
    shared:MeshStandardMaterial|undefined
  ) {
    body.color.setHex(surface.body?.color ?? 0x171b19);
    body.roughness = surface.body?.roughness ?? 0.7;
    body.metalness = surface.body?.metalness ?? 0;
    const style = surface.stickers;
    const pattern = style?.pattern ? this.retain(makePattern(style.pattern)) : null;
    const mask = surface.glow ? this.retain(makePattern('border',true)) : null;
    const materials = shared ? [...stickers,shared] : stickers;
    for (const [index, material] of materials.entries()) {
      material.roughness = style?.roughness ?? 0.65;
      material.metalness = style?.metalness ?? 0;
      material.opacity = style?.opacity ?? 1;
      material.transparent = material.opacity < 1;
      material.depthWrite = material.opacity === 1;
      material.map = pattern;
      material.normalMap = null;
      material.normalScale.setScalar(style?.normalScale ?? 0);
      material.emissive.setHex(surface.glow?.color ?? 0);
      material.emissiveIntensity = surface.glow?.intensity ?? 0;
      material.emissiveMap = mask;
      material.needsUpdate = true;
      this.attach(material,'map',style?.maps?.[index]);
      this.attach(material,'normalMap',style?.normalMap);
      this.attach(material,'emissiveMap',surface.glow?.map);
    }
    this.stickers = materials;
    this.primary.setHex(surface.glow?.color ?? 0);
    this.secondary.setHex(surface.pulse?.secondary ?? 0);
  }

  private retain(texture:Texture|undefined) {
    if (texture) this.textures.push(texture);
    return texture ?? null;
  }

  private attach(material:MeshStandardMaterial,key:'map'|'normalMap'|'emissiveMap',path:string|undefined) {
    if (!path || !/^\/assets\/skins\/[a-z0-9_-]+\/[a-z0-9_-]+\.png$/i.test(path)) return;
    const texture = this.loader.load(path, loaded => {
      if (this.disposed) return;
      if (key !== 'normalMap') loaded.colorSpace = SRGBColorSpace;
      material[key] = loaded;
      material.needsUpdate = true;
    },undefined,()=>{/* Keep the procedural surface. */});
    this.textures.push(texture);
  }

  animate(time:number):void {
    if (!this.surface.pulse) return;
    const amount = (1+Math.sin(time*this.surface.pulse.speed/400))/2;
    for (const sticker of this.stickers) sticker.emissive.copy(this.primary).lerp(this.secondary,amount);
  }

  dispose():void {
    this.disposed = true;
    for (const texture of this.textures) texture.dispose();
  }
}
