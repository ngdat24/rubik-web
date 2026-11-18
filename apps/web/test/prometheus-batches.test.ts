import {expect,it} from 'vitest';
import {BoxGeometry,Group,InstancedMesh,Matrix4,Mesh,MeshStandardMaterial,PerspectiveCamera,Raycaster,Scene,Vector3} from 'three';
import {PrometheusBatches} from '../src/prometheus-batches.js';

it('batches identical opaque geometry while preserving animation, visibility, picking and ownership',()=>{
  const scene=new Scene(),root=new Group();scene.add(root);
  const a=new BoxGeometry(),b=a.clone(),material=new MeshStandardMaterial();
  const first=new Mesh(a,material),second=new Mesh(b,material);second.position.x=2;root.add(first,second);
  const raycast=first.raycast,batches=new PrometheusBatches(scene,root);
  const mesh=scene.children.find(n=>n instanceof InstancedMesh) as InstancedMesh;
  expect(mesh.count).toBe(2);
  const hits=new Raycaster(new Vector3(0,0,5),new Vector3(0,0,-1)).intersectObject(first);
  expect(hits.length).toBeGreaterThan(0);
  root.position.y=3;root.rotation.y=.6;batches.update();
  const actual=new Matrix4();mesh.getMatrixAt(1,actual);
  expect(Math.max(...actual.elements.map((v,i)=>Math.abs(v-second.matrixWorld.elements[i]!)))).toBeLessThan(1e-6);
  root.visible=false;batches.update();mesh.getMatrixAt(0,actual);expect(mesh.count).toBe(0);
  root.visible=true;batches.update();mesh.getMatrixAt(0,actual);expect(mesh.count).toBe(2);batches.restoreLayers();expect(first.layers.mask).toBe(1);
  let freed=false;a.addEventListener('dispose',()=>{freed=true;});batches.dispose();
  expect(first.geometry).toBe(a);expect(second.geometry).toBe(b);expect(first.raycast).toBe(raycast);expect(freed).toBe(false);
  a.dispose();b.dispose();material.dispose();
});

it('keeps transparent surfaces and unequal vertex data out of batches',()=>{
  const scene=new Scene(),root=new Group();scene.add(root);
  const a=new BoxGeometry(),b=a.clone();b.translate(.2,0,0);
  const opaque=new MeshStandardMaterial(),glass=new MeshStandardMaterial({transparent:true,opacity:.7});
  root.add(new Mesh(a,opaque),new Mesh(b,opaque),new Mesh(a,glass),new Mesh(a,glass));
  const batches=new PrometheusBatches(scene,root);expect(scene.children.filter(n=>n instanceof InstancedMesh)).toHaveLength(0);
  batches.dispose();a.dispose();b.dispose();opaque.dispose();glass.dispose();
});

it('culls individual offscreen details and does not upload unchanged instance matrices',()=>{
  const scene=new Scene(),root=new Group(),camera=new PerspectiveCamera(40,1,.1,100);scene.add(root);camera.position.z=5;
  const geometry=new BoxGeometry(),material=new MeshStandardMaterial(),first=new Mesh(geometry,material),second=new Mesh(geometry,material);
  second.position.x=1000;root.add(first,second);
  const batches=new PrometheusBatches(scene,root,camera),mesh=scene.children.find(n=>n instanceof InstancedMesh) as InstancedMesh;
  expect(mesh.count).toBe(1);const version=mesh.instanceMatrix.version;
  batches.update();batches.restoreLayers();expect(mesh.instanceMatrix.version).toBe(version);
  second.position.x=1;batches.update();batches.restoreLayers();expect(mesh.count).toBe(2);expect(mesh.instanceMatrix.version).toBeGreaterThan(version);
  batches.dispose();geometry.dispose();material.dispose();
});
