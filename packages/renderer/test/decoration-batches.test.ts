import {expect,it} from 'vitest';
import {BoxGeometry,Group,InstancedMesh,Matrix4,Mesh,MeshStandardMaterial,Quaternion,Vector3} from 'three';
import {DecorationBatches,groupBodyFaces} from '../src/decoration-batches.js';

it('keeps nested decoration transforms and rotates only the selected cubie without drift',()=>{
  const group=new Group(),geometry=new BoxGeometry(),material=new MeshStandardMaterial();
  const bodies=[new Mesh(geometry,material),new Mesh(geometry,material)];
  bodies.forEach((body,index)=>{body.position.x=index+1;const parent=new Group();parent.position.y=.4;const detail=new Mesh(geometry,material);detail.position.z=.2;parent.add(detail);body.add(parent);group.add(body);});
  const batches=new DecorationBatches(group,bodies);
  const mesh=group.children.find(child=>child instanceof InstancedMesh) as InstancedMesh;
  expect(mesh.count).toBe(2);
  const base=new Matrix4(),current=new Matrix4(),other=new Matrix4();mesh.getMatrixAt(0,base);mesh.getMatrixAt(1,other);
  expect(new Vector3().setFromMatrixPosition(base).toArray()).toEqual([1,expect.closeTo(.4),expect.closeTo(.2)]);
  const q=new Quaternion().setFromAxisAngle(new Vector3(0,1,0),Math.PI/4);
  batches.begin([0]);batches.rotate(q);mesh.getMatrixAt(0,current);
  const expected=base.clone().premultiply(new Matrix4().makeRotationFromQuaternion(q));
  expect(Math.max(...current.elements.map((n,i)=>Math.abs(n-expected.elements[i]!)))).toBeLessThan(1e-6);
  mesh.getMatrixAt(1,current);expect(current.elements).toEqual(other.elements);
  batches.end();mesh.getMatrixAt(0,current);expect(current.elements).toEqual(base.elements);
  batches.dispose();geometry.dispose();material.dispose();
});

it('groups equal face materials while preserving every triangle and its material',()=>{
  const box=new BoxGeometry(),a=new MeshStandardMaterial(),b=new MeshStandardMaterial(),materials=[a,b,a,b,a,a];
  const grouped=groupBodyFaces(box,materials);
  const triangles=(geometry:BoxGeometry,mats:MeshStandardMaterial[])=>geometry.groups.flatMap(g=>Array.from({length:g.count/3},(_,i)=>mats[g.materialIndex!]!.uuid+':'+[0,1,2].map(j=>geometry.index!.getX(g.start+i*3+j)).join(','))).sort();
  expect(grouped.geometry.groups).toHaveLength(2);
  expect(triangles(grouped.geometry,grouped.materials)).toEqual(triangles(box,materials));
  box.dispose();grouped.geometry.dispose();a.dispose();b.dispose();
});
