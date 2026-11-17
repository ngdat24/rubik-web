import {expect,it} from 'vitest';
import {Cube,compileMove,invert,parseMove,scrambleAt} from '@rubik/engine';
import {layerSlots} from '../src/layout.js';
import {StickerArtwork} from '../src/sticker-artwork.js';

it('restores the exact unique 2×2 artwork and orientation from scrambled color snapshots',()=>{
  for(let seed=0;seed<100;seed++){
    const moves=[...scrambleAt('champion-artwork-'+seed,2,0), 'x','y',"z'"];
    const cube=new Cube(2),animated=new StickerArtwork(2),restored=new StickerArtwork(2);
    for(const move of moves){cube.applyMove(move);animated.advance(move,layerSlots(parseMove(move,2),2).stickerIndices);}
    restored.reset(cube.state);
    for(let i=0;i<24;i++){expect(restored.tile(i)).toBe(animated.tile(i));expect(restored.rotation(i)).toBe(animated.rotation(i));}
    for(const color of [0,3])expect([...cube.state].filter((c,i)=>c===color&&restored.tile(i)===0)).toHaveLength(1);
    for(const move of invert(moves,2)){cube.applyMove(move);restored.advance(move,layerSlots(parseMove(move,2),2).stickerIndices);}
    for(let i=0;i<24;i++){expect(restored.tile(i)).toBe(i%4);expect(restored.rotation(i)).toBe(0);}
    restored.reset(new Cube(2).state);
    for(let i=0;i<24;i++)expect(restored.tile(i)).toBe(i%4);
  }
});

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

it('keeps 2×2 corner signatures attached to the same pieces through mixed turns',()=>{
  const art=new StickerArtwork(2),moves=['R','U','F2','x',"B'",'D'];
  const signatureStart=0,logoStart=12;
  let signature=signatureStart,logo=logoStart;
  for(const move of moves){
    const permutation=compileMove(move,2);
    signature=permutation[signature]!;logo=permutation[logo]!;
    art.advance(move,layerSlots(parseMove(move,2),2).stickerIndices);
    expect(art.tile(signature)).toBe(0);
    expect(art.tile(logo)).toBe(0);
  }
  for(const move of invert(moves,2))art.advance(move,layerSlots(parseMove(move,2),2).stickerIndices);
  for(let i=0;i<24;i++){
    expect(art.tile(i)).toBe(i%4);expect(art.rotation(i)).toBe(0);
  }
});
