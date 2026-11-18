import {BufferAttribute,BufferGeometry,DynamicDrawUsage,Frustum,InstancedMesh,Matrix4,Mesh} from 'three';
import type {Camera,Material,Object3D,Scene} from 'three';

function equalGeometry(a:BufferGeometry,b:BufferGeometry):boolean {
  if(a===b)return true;
  if(a.drawRange.start!==b.drawRange.start||a.drawRange.count!==b.drawRange.count||Object.keys(a.morphAttributes).length||Object.keys(b.morphAttributes).length)return false;
  const names=Object.keys(a.attributes);
  if(names.length!==Object.keys(b.attributes).length)return false;
  for(const name of [...names,'index']){
    const x=name==='index'?a.index:a.attributes[name],y=name==='index'?b.index:b.attributes[name];
    if(!x&&!y)continue;
    if(!(x instanceof BufferAttribute)||!(y instanceof BufferAttribute)||x.itemSize!==y.itemSize||x.normalized!==y.normalized||x.array.constructor!==y.array.constructor||x.array.length!==y.array.length)return false;
    for(let i=0;i<x.array.length;i++)if(x.array[i]!==y.array[i])return false;
  }
  return true;
}

/** Batch only identical opaque meshes. Transparent ordering and every shader stay intact. */
export class PrometheusBatches {
  private readonly frustum=new Frustum();
  private readonly projection=new Matrix4();
  private readonly batches:{mesh:InstancedMesh;sources:{mesh:Mesh;layerMask:number}[]}[]=[];
  constructor(private readonly scene:Scene,root:Object3D,private readonly camera?:Camera){
    const groups:{geometry:BufferGeometry;material:Material;sources:Mesh[]}[]=[];
    root.traverse(node=>{
      if(!(node instanceof Mesh)||node instanceof InstancedMesh||Array.isArray(node.material)||node.material.transparent||node.material.type==='ShaderMaterial'||node.layers.mask!==1)return;
      const group=groups.find(g=>g.material===node.material&&equalGeometry(g.geometry,node.geometry));
      if(group)group.sources.push(node);else groups.push({geometry:node.geometry,material:node.material,sources:[node]});
    });
    for(const group of groups){
      if(group.sources.length<2)continue;
      const mesh=new InstancedMesh(group.geometry,group.material,group.sources.length);mesh.frustumCulled=false;
      mesh.instanceMatrix.setUsage(DynamicDrawUsage);
      const sources=group.sources.map(source=>({mesh:source,layerMask:source.layers.mask}));
      this.scene.add(mesh);this.batches.push({mesh,sources});
    }
    this.update(false);
  }
  update(hideSources=true):void {
    this.scene.updateMatrixWorld(true);
    if(this.camera){this.camera.updateMatrixWorld();this.frustum.setFromProjectionMatrix(this.projection.multiplyMatrices(this.camera.projectionMatrix,this.camera.matrixWorldInverse),this.camera.coordinateSystem);}
    for(const {mesh,sources} of this.batches){
      let count=0,changed=false;
      sources.forEach(source=>{
        let visible=true;
        for(let parent:Object3D|null=source.mesh;parent;parent=parent.parent)if(!parent.visible){visible=false;break;}
        if(visible&&this.camera&&source.mesh.frustumCulled)visible=this.frustum.intersectsObject(source.mesh);
        if(visible){
          const matrix=source.mesh.matrixWorld;
          for(let i=0;i<16;i++)if(Math.fround(matrix.elements[i]!)!==mesh.instanceMatrix.array[count*16+i]){mesh.setMatrixAt(count,matrix);changed=true;break;}
          count++;
        }
        if(hideSources)source.mesh.layers.mask=0;
      });mesh.count=count;mesh.visible=count>0;if(changed)mesh.instanceMatrix.needsUpdate=true;
    }
  }
  restoreLayers():void {for(const {sources} of this.batches)for(const source of sources)source.mesh.layers.mask=source.layerMask;}
  dispose():void {
    this.restoreLayers();
    for(const {mesh} of this.batches){mesh.removeFromParent();mesh.dispose();}
    this.batches.length=0;
  }
}
