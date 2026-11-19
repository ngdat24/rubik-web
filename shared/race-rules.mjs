import {Cube,stickerGeometry,NORMALS,isSolved,f2lSolvedAny,matchScrambleAt,scrambleCandidate} from '../packages/engine/dist/index.js';

export const RACE_DURATION_MS=180000;
const faceLayers=Array.from({length:6},(_,face)=>Array.from({length:54},(_,i)=>i).filter(i=>{
  const p=stickerGeometry(i,3).cubie;
  return NORMALS[face].reduce((sum,n,axis)=>sum+n*p[axis],0)===2;
}));
/** Includes side stickers of each edge/corner, relative to current centers. */
export function faceSolved(state,face){
  if(state.length!==54||!Number.isInteger(face)||face<0||face>5)throw new RangeError('One face requires 3x3 and a valid face');
  return faceLayers[face].every(i=>state[i]===state[Math.floor(i/9)*9+4]);
}
export function oneFaceSolved(state){return [0,1,2,3,4,5].some(face=>faceSolved(state,face));}
export function raceComplete(state,mode){
  if(mode==='oneFace')return oneFaceSolved(state);
  if(mode==='fullSolve')return isSolved(state,3);
  if(mode==='twoByTwo')return isSolved(state,2);
  if(mode==='f2lRush')return f2lSolvedAny(state);
  throw new Error('Unsupported race mode');
}
export function raceScramble(seed,k,mode){
  if(mode==='twoByTwo')return matchScrambleAt(seed,2,k,1);
  if(mode!=='oneFace')return matchScrambleAt(seed,3,k,1);
  let moves=[];
  for(let j=0;j<1000;j++){
    moves=scrambleCandidate(seed,3,k,1,j);
    const state=new Cube(3).applyMoves(moves).state;
    if(!isSolved(state,3)&&!f2lSolvedAny(state)&&!oneFaceSolved(state))return moves;
  }
  return moves;
}
