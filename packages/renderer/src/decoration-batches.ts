import {BoxGeometry,Group,InstancedMesh,Matrix4,Mesh,Quaternion} from 'three';
import type {MeshStandardMaterial} from 'three';

/** Keep every opaque detail, but submit equal geometry/material pairs together. */
export class DecorationBatches {
  private readonly batches:{mesh:InstancedMesh;bases:Matrix4[];owners:number[]}[]=[];
  private selected=new Set<number>();
  private readonly rotation=new Matrix4();
  private readonly scratch=new Matrix4();
  constructor(group:Group,bodies:readonly Mesh[]) {
    group.updateMatrixWorld(true);
    const groups=new Map<string,{nodes:Mesh[];owners:number[]}>();
    bodies.forEach((body,owner)=>body.traverse(node=>{
      if(node===body||!(node instanceof Mesh)||Array.isArray(node.material)||node.material.transparent)return;
      const key=node.geometry.uuid+'/'+node.material.uuid;
      const batch=groups.get(key)??{nodes:[],owners:[]};
      batch.nodes.push(node);batch.owners.push(owner);groups.set(key,batch);
    }));
    // Capture all world transforms before detaching any nested magnet/rim/gem.
    const prepared=[...groups.values()].map(({nodes,owners})=>({nodes,owners,bases:nodes.map(node=>node.matrixWorld.clone())}));
    for(const {nodes,owners,bases} of prepared){
      const first=nodes[0]!;
      const mesh=new InstancedMesh(first.geometry,first.material,bases.length);
      mesh.frustumCulled=false;
      bases.forEach((matrix,index)=>mesh.setMatrixAt(index,matrix));
      group.add(mesh);this.batches.push({mesh,bases,owners});
      nodes.forEach(node=>node.removeFromParent());
    }
  }
  begin(cubies:readonly number[]):void {this.selected=new Set(cubies);}
  rotate(quaternion:Quaternion):void {
    this.rotation.makeRotationFromQuaternion(quaternion);
    for(const {mesh,bases,owners} of this.batches){
      bases.forEach((base,index)=>{if(this.selected.has(owners[index]!))mesh.setMatrixAt(index,this.scratch.multiplyMatrices(this.rotation,base));});
      mesh.instanceMatrix.needsUpdate=true;
    }
  }
  end():void {
    for(const {mesh,bases,owners} of this.batches){
      bases.forEach((base,index)=>{if(this.selected.has(owners[index]!))mesh.setMatrixAt(index,base);});
      mesh.instanceMatrix.needsUpdate=true;
    }
    this.selected.clear();
  }
  dispose():void {for(const {mesh} of this.batches){mesh.removeFromParent();mesh.dispose();}this.batches.length=0;}
}

/** Combine equal-material box faces without changing their vertices or winding. */
export function groupBodyFaces(source:BoxGeometry,materials:MeshStandardMaterial[]):{geometry:BoxGeometry;materials:MeshStandardMaterial[]} {
  const geometry=source.clone(),unique=[...new Set(materials)],indices:number[]=[];
  geometry.clearGroups();
  for(const [materialIndex,material] of unique.entries()){
    const start=indices.length;
    for(const group of source.groups){
      if(materials[group.materialIndex!]!==material)continue;
      for(let index=group.start;index<group.start+group.count;index++)indices.push(source.index!.getX(index));
    }
    geometry.addGroup(start,indices.length-start,materialIndex);
  }
  geometry.setIndex(indices);
  return {geometry,materials:unique};
}
