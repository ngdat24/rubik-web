import {compileMove,parseMove,rotateVector,stickerGeometry} from '@rubik/engine';
import type {Move,Vector3} from '@rubik/engine';

const dot=(a:Vector3,b:Vector3)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const negate=(v:Vector3):Vector3=>[-v[0],-v[1],-v[2]];
const cross=(a:Vector3,b:Vector3):Vector3=>[
  a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]
];

/** Visual identity and orientation only; cube colors still come from controller snapshots. */
export class StickerArtwork {
  private readonly tiles:Uint8Array;
  private readonly turns:Uint8Array;
  private readonly bases:{up:Vector3;right:Vector3}[];
  constructor(private readonly size:number) {
    this.tiles=new Uint8Array(6*size*size);
    this.turns=new Uint8Array(this.tiles.length);
    this.bases=Array.from({length:6},(_,face)=>{
      const normal=stickerGeometry(face*size*size,size).normal;
      // Match the mesh's Quaternion.setFromUnitVectors(+Z, normal) UV basis.
      const up:Vector3=normal[1] ? [0,0,-normal[1]] : [0,1,0];
      return {up,right:cross(up,normal)};
    });
    this.reset();
  }
  reset(state?:Uint8Array):void {
    this.tiles.forEach((_,index)=>{this.tiles[index]=index%(this.size*this.size);});
    this.turns.fill(0);
    if(this.size===2&&state)this.restoreCorners(state);
  }
  /** A 2×2 color snapshot uniquely identifies each corner and its sticker orientation. */
  private restoreCorners(state:Uint8Array):void {
    const slots=Array.from({length:24},(_,i)=>stickerGeometry(i,2));
    const normals=this.bases.map((_,face)=>stickerGeometry(face*4,2).normal);
    const tiles=this.tiles.slice(),turns=this.turns.slice(),used=new Set<number>();
    for(let index=0;index<24;index++){
      const slot=slots[index]!;
      const corner=slots.map((s,i)=>({s,i})).filter(({s})=>s.cubie.every((n,a)=>n===slot.cubie[a]));
      const origin=normals[0]!.map((_,axis)=>corner.reduce((sum,{i})=>sum+normals[state[i]!]![axis]!,0));
      const color=state[index]!;
      const from=slots.findIndex(s=>s.cubie.every((n,a)=>n===origin[a])&&s.normal.every((n,a)=>n===normals[color]![a]));
      // Display snapshots may be synthetic/invalid; keep the ordinary reset in that case.
      if(from<0||used.has(from))return;
      used.add(from);tiles[index]=from%4;
      const up=this.bases[color]!.up;
      const rotated=up.map((_,axis)=>corner.reduce((sum,{s,i})=>sum+dot(up,normals[state[i]!]!)*s.normal[axis]!,0)) as unknown as Vector3;
      const target=this.bases[Math.floor(index/4)]!;
      turns[index]=dot(rotated,target.up)===1?0:dot(rotated,target.right)===-1?1:dot(rotated,target.up)===-1?2:3;
    }
    this.tiles.set(tiles);this.turns.set(turns);
  }
  tile(index:number):number {return this.tiles[index]!;}
  rotation(index:number):number {return this.turns[index]!;}
  advance(move:Move,selected:readonly number[]):void {
    const permutation=compileMove(move,this.size),parsed=parseMove(move,this.size);
    const tiles=this.tiles.slice(),turns=this.turns.slice();
    for(const from of selected){
      const to=permutation[from]!,basis=this.bases[Math.floor(from/(this.size*this.size))]!;
      const quarter=turns[from]!;
      const up:Vector3=quarter===0 ? basis.up : quarter===1 ? negate(basis.right)
        : quarter===2 ? negate(basis.up) : basis.right;
      const rotated=rotateVector(up,parsed.axis,parsed.quarterTurns);
      const target=this.bases[Math.floor(to/(this.size*this.size))]!;
      this.tiles[to]=tiles[from]!;
      this.turns[to]=dot(rotated,target.up)===1 ? 0 : dot(rotated,target.right)===-1 ? 1
        : dot(rotated,target.up)===-1 ? 2 : 3;
    }
  }
}
