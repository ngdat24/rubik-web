export type FaceName = 'U'|'R'|'F'|'D'|'L'|'B';
export interface FaceView {face:FaceName;area:number;x:number;y:number}
export const FACE_NORMALS:Record<FaceName,readonly [number,number,number]>={U:[0,1,0],R:[1,0,0],F:[0,0,1],D:[0,-1,0],L:[-1,0,0],B:[0,0,-1]};
const opposite:Record<FaceName,FaceName>={U:'D',D:'U',R:'L',L:'R',F:'B',B:'F'};
/** Area ties prefer the upper centre, then the left centre. y grows upwards. */
export function viewFaces(views:readonly FaceView[]):Record<FaceName,FaceName>{
 const sorted=[...views].sort((a,b)=>Math.abs(a.area-b.area)>1e-9?b.area-a.area:Math.abs(a.y-b.y)>1e-9?b.y-a.y:a.x-b.x);
 const front=sorted[0]!.face,n=FACE_NORMALS[front];
 const up=[...views].filter(v=>v.face!==front&&v.face!==opposite[front]).sort((a,b)=>Math.abs(a.y-b.y)>1e-9?b.y-a.y:a.x-b.x)[0]!.face;
 const u=FACE_NORMALS[up],right=[u[1]*n[2]-u[2]*n[1],u[2]*n[0]-u[0]*n[2],u[0]*n[1]-u[1]*n[0]];
 const r=(Object.keys(FACE_NORMALS) as FaceName[]).find(f=>FACE_NORMALS[f].every((v,i)=>v===right[i]))!;
 return {F:front,B:opposite[front],U:up,D:opposite[up],R:r,L:opposite[r]};
}
export function viewMove(move:string,faces:Record<FaceName,FaceName>):string{
 const match=move.match(/^(\d+)?([URFDLBMESxyz])(w)?(['2])?$/);if(!match)return move;
 const [,prefix='',symbol,wide='',suffix='']=match;
 if(symbol && Object.hasOwn(FACE_NORMALS,symbol))return prefix+faces[symbol as FaceName]+wide+suffix;
 const source={x:'R',y:'U',z:'F',M:'R',E:'U',S:'F'}[symbol!] as FaceName;
 const normal=FACE_NORMALS[faces[source]],axis=normal.findIndex(v=>v!==0),sign=normal[axis]!;
 const slice='MES'.includes(symbol!);const target=slice?['M','E','S'][axis]!:['x','y','z'][axis]!;
 const sourceBase=slice?(symbol==='S'?-1:1):-1,targetBase=slice?(target==='S'?-1:1):-1;
 const reverse=sourceBase*sign!==targetBase;
 return target+(suffix==='2'?'2':reverse?(suffix==="'"?'':"'"):suffix);
}
