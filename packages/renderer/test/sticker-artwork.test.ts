import {expect,it} from 'vitest';
import {compileMove,invert,parseMove} from '@rubik/engine';
import {layerSlots} from '../src/layout.js';
import {StickerArtwork} from '../src/sticker-artwork.js';

it('keeps the original atlas tile and rotates its UV basis through R',()=>{
  const art=new StickerArtwork(3);
  art.advance('R',layerSlots(parseMove('R',3),3).stickerIndices);
  const destination=compileMove('R',3)[9]!;
  expect(destination).toBe(11);
  expect(art.tile(destination)).toBe(0);
  expect(art.rotation(destination)).toBe(3);
  // A center does not change slot but its engraving still rotates.
  expect(art.rotation(13)).toBe(3);
});

it.each(['R','U','F','D','L','B','M','E','S','x','y','z','Rw','F2'])(
  'restores all artwork after %s and its inverse',move=>{
    const art=new StickerArtwork(3);
    for(const m of [move,...invert([move],3)])art.advance(m,layerSlots(parseMove(m,3),3).stickerIndices);
    for(let index=0;index<54;index++){
      expect(art.tile(index)).toBe(index%9);
      expect(art.rotation(index)).toBe(0);
    }
  }
);

it('composes mixed turns and resets independently from cube color snapshots',()=>{
  const art=new StickerArtwork(3),moves=['R','U','F2','x','M',"Rw'",'D'];
  for(const move of [...moves,...invert(moves,3)])art.advance(move,layerSlots(parseMove(move,3),3).stickerIndices);
  for(let i=0;i<54;i++){expect(art.tile(i)).toBe(i%9);expect(art.rotation(i)).toBe(0);}
  art.advance('R',layerSlots(parseMove('R',3),3).stickerIndices);art.reset();
  for(let i=0;i<54;i++){expect(art.tile(i)).toBe(i%9);expect(art.rotation(i)).toBe(0);}
});
