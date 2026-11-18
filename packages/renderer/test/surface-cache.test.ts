import {afterEach,expect,it,vi} from 'vitest';
import {MeshStandardMaterial,Texture,TextureLoader,SRGBColorSpace} from 'three';
import {SurfaceMaterials} from '../src/surface.js';

afterEach(()=>vi.restoreAllMocks());

it('shares repeated skin maps, isolates colour spaces and disposes each texture once',()=>{
  const pending:(()=>void)[]=[],textures:Texture[]=[];
  vi.spyOn(TextureLoader.prototype,'load').mockImplementation((_path,onLoad)=>{
    const texture=new Texture();textures.push(texture);
    pending.push(()=>onLoad?.(texture));return texture;
  });
  const path='/assets/skins/test/map.png',body=new MeshStandardMaterial();
  const stickers=Array.from({length:6},()=>new MeshStandardMaterial());
  const surface=new SurfaceMaterials({stickers:{roughness:.5,metalness:.2,opacity:1,normalScale:.3,
    maps:Array(6).fill(path),normalMap:path,roughnessMap:path,centerMap:path}},body,stickers,undefined,[1,2,3,4,5,6],3,true);
  expect(textures).toHaveLength(2);
  pending.forEach(load=>load());
  expect(stickers[0]!.map).toBe(stickers[5]!.map);
  expect(surface.stickerFor(0,4).map).toBe(stickers[0]!.map);
  expect(stickers[0]!.normalMap).toBe(stickers[5]!.roughnessMap);
  expect(stickers[0]!.normalMap).not.toBe(stickers[0]!.map);
  expect(stickers[0]!.map!.colorSpace).toBe(SRGBColorSpace);
  expect(stickers[0]!.normalMap!.colorSpace).not.toBe(SRGBColorSpace);
  const disposed=textures.map(texture=>vi.spyOn(texture,'dispose'));
  surface.dispose();disposed.forEach(spy=>expect(spy).toHaveBeenCalledOnce());
  body.dispose();stickers.forEach(material=>material.dispose());
});

it('ignores a texture completing after the skin has been removed',()=>{
  let complete=()=>{};
  const texture=new Texture();
  vi.spyOn(TextureLoader.prototype,'load').mockImplementation((_path,onLoad)=>{
    complete=()=>onLoad?.(texture);return texture;
  });
  const body=new MeshStandardMaterial(),stickers=Array.from({length:6},()=>new MeshStandardMaterial());
  const surface=new SurfaceMaterials({stickers:{roughness:.5,metalness:0,opacity:1,normalScale:0,
    maps:Array(6).fill('/assets/skins/test/map.png')}},body,stickers,undefined,[1,2,3,4,5,6],3,true);
  surface.dispose();complete();
  expect(stickers.every(material=>material.map===null)).toBe(true);
  body.dispose();stickers.forEach(material=>material.dispose());
});
