import {BufferAttribute,BufferGeometry,Quaternion,ShapeUtils,Vector3} from 'three';
import type {Vector2} from 'three';

/** A face's square pyramid is split into nine cap-sized wedges for layer animation.
 * All apices remain at cube origin under turns about the engine's X/Y/Z axes.
 */
export function facePyramidWedge(baseCenter:readonly number[],normal:readonly number[],cubieCenter:readonly number[],outline:readonly Vector2[]):BufferGeometry{
  const n=new Vector3(...normal as [number,number,number]);
  const orientation=new Quaternion().setFromUnitVectors(new Vector3(0,0,1),n);
  const center=new Vector3(...baseCenter as [number,number,number]).addScaledVector(n,-.030);
  const body=new Vector3(...cubieCenter as [number,number,number]);
  const contour=outline.map(p=>p.clone().multiplyScalar(.995));
  if(contour.length>1&&contour[0]!.distanceTo(contour.at(-1)!)<1e-7)contour.pop();
  if(ShapeUtils.isClockWise(contour))contour.reverse();
  const points=contour.map(p=>new Vector3(p.x,p.y,0).applyQuaternion(orientation).add(center).sub(body));
  const apex=points.length;
  points.push(body.clone().negate());
  const triangles=ShapeUtils.triangulateShape(contour,[]),positions:number[]=[];
  for(let i=0;i<apex;i++)triangles.push([apex,(i+1)%apex,i]);
  for(const triangle of triangles)for(const index of triangle)positions.push(...points[index]!.toArray());
  const geometry=new BufferGeometry();geometry.setAttribute('position',new BufferAttribute(new Float32Array(positions),3));geometry.computeVertexNormals();
  geometry.setAttribute('innerGemSource',new BufferAttribute(new Float32Array(positions.map((value,index)=>value+body.getComponent(index%3))),3));
  geometry.userData.apexLocal=points[apex]!.toArray();geometry.userData.normal=[...normal];
  geometry.userData.baseContour=contour.map(p=>p.toArray());
  return geometry;
}
