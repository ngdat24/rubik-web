import {expect,it} from 'vitest';
import {FACE_NORMALS,viewFaces,viewMove} from '../src/view.js';
import type {FaceName,FaceView} from '../src/view.js';
const sample=(values:Partial<Record<FaceName,{area:number;x:number;y:number}>>):FaceView[]=>(Object.keys(FACE_NORMALS) as FaceName[]).map(face=>({face,area:0,x:0,y:0,...values[face]}));
it('uses largest projected face; ties prefer top then left',()=>{
 expect(viewFaces(sample({F:{area:0.5,x:0,y:0},R:{area:0.3,x:1,y:0},U:{area:0.2,x:0,y:1}})).F).toBe('F');
 expect(viewFaces(sample({F:{area:0.5,x:-1,y:0},R:{area:0.5,x:1,y:0}})).F).toBe('F');
 expect(viewFaces(sample({F:{area:1/3,x:-1,y:0},R:{area:1/3,x:1,y:0},U:{area:1/3,x:0,y:1}})).F).toBe('U');
});
it('produces a proper cube orientation and maps face/wide/rotation/slice directions',()=>{
 const faces=viewFaces(sample({B:{area:1,x:0,y:0},U:{area:0.4,x:0,y:1},L:{area:0.3,x:-1,y:0}}));
 expect(faces).toEqual({F:'B',B:'F',U:'U',D:'D',R:'L',L:'R'});
 expect(viewMove("3Rw'",faces)).toBe("3Lw'");expect(viewMove('x',faces)).toBe("x'");expect(viewMove('x2',faces)).toBe('x2');expect(viewMove('M',faces)).toBe("M'");
 for(const front of Object.keys(FACE_NORMALS) as FaceName[]){
  const map=viewFaces(sample({[front]:{area:1,x:0,y:0}}));expect(new Set(Object.values(map)).size).toBe(6);
  for(const face of Object.keys(map) as FaceName[]){const a=FACE_NORMALS[map[face]],b=FACE_NORMALS[map[({U:'D',D:'U',R:'L',L:'R',F:'B',B:'F'} as const)[face]]];expect(a.every((v,i)=>v===-b[i]!)).toBe(true);}
 }
});
