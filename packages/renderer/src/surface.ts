import {CanvasTexture, Color, MeshStandardMaterial, SRGBColorSpace, TextureLoader} from 'three';
import type {Texture} from 'three';

export interface CubeSurface {
  body?: {color:number; roughness:number; metalness:number; map?:string};
  stickers?: {
    roughness:number; metalness:number; opacity:number; pattern?:string;
    maps?:readonly (string|undefined)[]; tileAtlases?:readonly (string|undefined)[];
    centerMap?:string; centerBumpMap?:string; centerBumpScale?:number;
    replaceColor?:boolean; normalMap?:string; normalScale:number;
  };
  glow?: {color:number; intensity:number; map?:string};
  pulse?: {speed:number; secondary:number};
}

const isSkinTexture = (path:string|undefined): path is string => Boolean(path && /^\/assets\/skins\/[a-z0-9_-]+\/[a-z0-9_-]+\.png$/i.test(path));

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
  private readonly albedoMaterials = new Set<MeshStandardMaterial>();
  private readonly tiles: MeshStandardMaterial[][] = [];
  private readonly allStickers: readonly MeshStandardMaterial[];
  private readonly secondary = new Color();
  private readonly primary = new Color();
  private disposed = false;
  private readonly cache=new Map<string,{texture:Texture;loaded:Texture|undefined;listeners:((texture:Texture)=>void)[]}>();
  get isAnimated():boolean {return Boolean(this.surface.pulse);}

  constructor(
    private readonly surface:CubeSurface,
    body:MeshStandardMaterial,
    private readonly stickers:readonly MeshStandardMaterial[],
    shared:MeshStandardMaterial|undefined,
    theme:readonly number[],
    tileSize:number,
    private readonly reuseTextures=false,
    private readonly changed:()=>void=()=>{}
  ) {
    body.color.setHex(surface.body?.color ?? 0x171b19);
    body.roughness = surface.body?.roughness ?? 0.7;
    body.metalness = surface.body?.metalness ?? 0;
    body.map = null;
    body.needsUpdate = true;
    this.attach(body,'map',surface.body?.map);
    const style = surface.stickers;
    const pattern = style?.pattern ? this.retain(makePattern(style.pattern)) : null;
    const mask = surface.glow ? this.retain(makePattern('border',true)) : null;
    const materials = shared ? [...stickers,shared] : stickers;
    const configure = (material:MeshStandardMaterial,map:string|undefined) => {
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
      this.attach(material,'map',map,style?.replaceColor);
      this.attach(material,'normalMap',style?.normalMap);
      this.attach(material,'emissiveMap',surface.glow?.map);
    };
    materials.forEach((material,index)=>configure(material,style?.maps?.[index]));
    const atlases = tileSize ? style?.tileAtlases : undefined;
    const hasAtlas = atlases?.some(isSkinTexture);
    const centerMap = tileSize===3 ? style?.centerMap : undefined;
    if (hasAtlas || centerMap) {
      for (const tile of hasAtlas ? Array.from({length:tileSize*tileSize},(_,index)=>index) : [4]) this.tiles[tile] = stickers.map((_,color)=>{
        const material = new MeshStandardMaterial();
        configure(material,tile===4 && centerMap ? centerMap : style?.maps?.[color]);
        if(tileSize===3 && tile===4) {
          material.bumpScale = style?.centerBumpScale ?? 0;
          this.attach(material,'bumpMap',style?.centerBumpMap);
        }
        return material;
      });
      atlases?.slice(0,stickers.length).forEach((path,color)=>{
        if(isSkinTexture(path)) this.attachAtlas(path,color,style?.replaceColor === true,tileSize);
      });
    }
    this.allStickers = [...materials,...this.tiles.flat()];
    this.setTheme(theme);
    this.primary.setHex(surface.glow?.color ?? 0);
    this.secondary.setHex(surface.pulse?.secondary ?? 0);
  }

  private retain(texture:Texture|undefined) {
    if (texture) this.textures.push(texture);
    return texture ?? null;
  }

  private attach(material:MeshStandardMaterial,key:'map'|'normalMap'|'emissiveMap'|'bumpMap',path:string|undefined,replaceColor=false) {
    if (!isSkinTexture(path)) return;
    this.loadTexture(path,key==='map'||key==='emissiveMap',loaded => {
      if (this.disposed) return;
      if (key === 'map' || key === 'emissiveMap') loaded.colorSpace = SRGBColorSpace;
      material[key] = loaded;
      if (replaceColor) {
        this.albedoMaterials.add(material);
        material.color.setHex(0xffffff);
      }
      material.needsUpdate = true;
    });
  }

  private loadTexture(path:string,srgb:boolean,ready:(texture:Texture)=>void):void {
    const key=path+'/'+srgb,existing=this.reuseTextures?this.cache.get(key):undefined;
    if(existing){if(existing.loaded)ready(existing.loaded);else existing.listeners.push(ready);return;}
    const listeners=[ready];let loadedTexture:Texture|undefined;
    const texture=this.loader.load(path,loaded=>{
      if(this.disposed)return;
      if(srgb)loaded.colorSpace=SRGBColorSpace;
      loadedTexture=loaded;
      const entry=this.cache.get(key);if(entry)entry.loaded=loaded;
      listeners.forEach(listener=>listener(loaded));listeners.length=0;this.changed();
    },undefined,()=>{/* Keep the procedural surface. */});
    this.textures.push(texture);
    if(this.reuseTextures)this.cache.set(key,{texture,loaded:loadedTexture,listeners});
  }

  private attachAtlas(path:string,color:number,replaceColor:boolean,tileSize:number):void {
    this.loadTexture(path,true,atlas=>{
      if (this.disposed) return;
      atlas.colorSpace = SRGBColorSpace;
      // The gutters keep neighbouring tiles out of the mip levels at grazing angles.
      const unit = 1/tileSize, inset = 2/(256*tileSize);
      this.tiles.forEach((group,tile)=>{
        const crop = atlas.clone();
        crop.repeat.setScalar(unit-2*inset);
        crop.offset.set(tile%tileSize*unit+inset,(tileSize-1-Math.floor(tile/tileSize))*unit+inset);
        crop.needsUpdate = true;
        this.retain(crop);
        const material = group[color]!;
        material.map = crop;
        if(replaceColor){
          this.albedoMaterials.add(material);
          material.color.setHex(0xffffff);
        }
        material.needsUpdate = true;
      });
    });
  }

  stickerFor(color:number,tile:number):MeshStandardMaterial {
    return this.tiles[tile]?.[color] ?? this.stickers[color]!;
  }

  setTheme(theme:readonly number[]):void {
    for (const group of [this.stickers,...this.tiles.filter(Boolean)]) {
      group.forEach((material,index)=>material.color.setHex(this.albedoMaterials.has(material) ? 0xffffff : theme[index]!));
    }
  }

  animate(time:number):void {
    if (!this.surface.pulse) return;
    const amount = (1+Math.sin(time*this.surface.pulse.speed/400))/2;
    for (const sticker of this.allStickers) sticker.emissive.copy(this.primary).lerp(this.secondary,amount);
  }

  dispose():void {
    this.disposed = true;
    this.cache.clear();
    for (const texture of this.textures) texture.dispose();
    for (const material of this.tiles.flat()) material.dispose();
  }
}
