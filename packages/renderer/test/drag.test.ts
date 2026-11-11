import { expect, it } from 'vitest';
import { parseMove, stickerGeometry } from '@rubik/engine';
import { buildLayout, dragTurn, pickedSlot, rotationFor } from '../src/layout.js';
it('preserves engine slot identities and resolves every face tangent, size and reverse drag',()=>{
 for(let n=2;n<=10;n++) for(const slot of buildLayout(n).slots){
  expect(pickedSlot(n,slot.index)).toEqual(slot);
  expect(slot.normal).toEqual(stickerGeometry(slot.index,n).normal);
  for(let tangent=0;tangent<3;tangent++){
   if(slot.normal[tangent])continue;
   const d=[0,0,0];d[tangent]=1;
   const a=dragTurn(n,slot.index,d)!,b=dragTurn(n,slot.index,d.map(v=>-v))!;
   expect(a.axis).toBe(b.axis);expect(a.layer).toBe(b.layer);
   expect(rotationFor(parseMove(a.move,n)).angle).toBe(-rotationFor(parseMove(b.move,n)).angle);
   expect(Math.sign(rotationFor(parseMove(a.move,n)).angle)).toBe(a.sign);
  }
 }
 expect(pickedSlot(3,-1)).toBeNull();expect(dragTurn(3,0,[0,0,0])).toBeNull();
});
