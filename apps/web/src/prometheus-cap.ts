import {BufferAttribute,BufferGeometry,Shape} from 'three';
import {prometheus} from './prometheus-config.js';
const half=(1-prometheus.geometry.pieceGapMm/(prometheus.geometry.nominalCubeMm/3))/2;

/** Inward corners retain the approved speedcube cutouts; outer corners use 0.14. */
function radii(tile:number,round:number):[number,number,number,number]{
  const r:[number,number,number,number]=[.14,.14,.14,.14];
  if(tile===4)r.fill(prometheus.fixedAppearance.centerRound);
  else if(tile===1){r[0]=round;r[1]=round;}
  else if(tile===3){r[1]=round;r[2]=round;}
  else if(tile===5){r[0]=round;r[3]=round;}
  else if(tile===7){r[2]=round;r[3]=round;}
  return r;
}
export function capShape(tile:number,round:number):Shape{
  const [a,b,c,d]=radii(tile,round),h=half,s=new Shape();
  s.moveTo(-h+a,-h);s.lineTo(h-b,-h);s.absarc(h-b,-h+b,b,-Math.PI/2,0,false);
  s.lineTo(h,h-c);s.absarc(h-c,h-c,c,0,Math.PI/2,false);
  s.lineTo(-h+d,h);s.absarc(-h+d,h-d,d,Math.PI/2,Math.PI,false);
  s.lineTo(-h,-h+a);s.absarc(-h+a,-h+a,a,Math.PI,Math.PI*1.5,false);s.closePath();return s;
}
export function capElevation(x:number,y:number,tile:number,round:number):number{
  const r=radii(tile,round)[y<0?(x<0?0:1):(x<0?3:2)];
  const qx=Math.abs(x)-(half-r),qy=Math.abs(y)-(half-r);
  const signed=Math.hypot(Math.max(qx,0),Math.max(qy,0))+Math.min(Math.max(qx,qy),0)-r;
  return prometheus.geometry.domeElevation*Math.sin(Math.max(0,Math.min(1,-signed/half))*Math.PI/2);
}
/** Tessellated top AND physical sidewall; front silhouette and normals are not shader fakes. */
export function domedCap(tile:number,round:number,segments=24):BufferGeometry{
  const positions:number[]=[],uvs:number[]=[],indices:number[]=[],h=half;
  const corner=radii(tile,round);
  for(let iy=0;iy<=segments;iy++)for(let ix=0;ix<=segments;ix++){
    let x=(ix/segments*2-1)*h,y=(iy/segments*2-1)*h;
    const r=corner[y<0?(x<0?0:1):(x<0?3:2)];
    const ax=Math.abs(x),ay=Math.abs(y);
    if(ax>h-r&&ay>h-r){
      const a=(ax-h+r)/r,b=(ay-h+r)/r;
      x=Math.sign(x)*(h-r+r*a*Math.sqrt(1-b*b/2));
      y=Math.sign(y)*(h-r+r*b*Math.sqrt(1-a*a/2));
    }
    positions.push(x,y,.057+capElevation(x,y,tile,round));uvs.push(x+.5,y+.5);
    if(ix<segments&&iy<segments){const a=iy*(segments+1)+ix,b=a+1,c=a+segments+1;indices.push(a,b,c,b,c+1,c);}
  }
  const boundary:number[]=[];
  for(let x=0;x<=segments;x++)boundary.push(x);
  for(let y=1;y<=segments;y++)boundary.push(y*(segments+1)+segments);
  for(let x=segments-1;x>=0;x--)boundary.push(segments*(segments+1)+x);
  for(let y=segments-1;y>=1;y--)boundary.push(y*(segments+1));
  for(let i=0;i<boundary.length;i++){
    const a=boundary[i]!,b=boundary[(i+1)%boundary.length]!,offset=positions.length/3;
    for(const [index,z] of [[a,positions[a*3+2]!],[b,positions[b*3+2]!],[a,-.035],[b,-.035]]){
      positions.push(positions[index!*3]!,positions[index!*3+1]!,z!);uvs.push(uvs[index!*2]!,uvs[index!*2+1]!);
    }
    indices.push(offset,offset+2,offset+1,offset+1,offset+2,offset+3);
  }
  const geometry=new BufferGeometry();geometry.setAttribute('position',new BufferAttribute(new Float32Array(positions),3));geometry.setAttribute('uv',new BufferAttribute(new Float32Array(uvs),2));geometry.setIndex(indices);geometry.computeVertexNormals();return geometry;
}
