import {ExtrudeGeometry,Group,Mesh,Path,RingGeometry,Shape,TorusGeometry,Vector2} from 'three';
import type {BufferGeometry,MeshPhysicalMaterial} from 'three';
import {sacredFlame} from './prometheus-ornaments.js';
export function centerGoldMaterial(base:MeshPhysicalMaterial,wave:{value:number}){
  const material=base.clone();
  material.onBeforeCompile=shader=>{
    shader.uniforms.goldWave=wave;
    shader.vertexShader='varying vec2 goldPoint;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n goldPoint=position.xy;');
    shader.fragmentShader='uniform float goldWave;varying vec2 goldPoint;\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>
      if(goldWave>=0.)totalEmissiveRadiance+=vec3(1.,.55,.025)*(1.-smoothstep(.025,.12,abs(goldWave-length(goldPoint)/2.12132034*.8)))*1.8;
    `);
  };material.customProgramCacheKey=()=> 'prometheus-center-gold-wave-v1';return material;
}

/** A concentric gold band with constant width and fine Greek-key inlay. */
export function centerRing(gold:MeshPhysicalMaterial,ink:MeshPhysicalMaterial,geometries:BufferGeometry[]):Group{
  const group=new Group();group.userData.kind='medallion-ring';group.position.z=.102;
  const band=new RingGeometry(.354,.390,128);geometries.push(band);group.add(new Mesh(band,gold));
  for(const radius of [.354,.390]){
    const geometry=new TorusGeometry(radius,.004,8,128);geometries.push(geometry);group.add(new Mesh(geometry,gold));
  }
  const shapes:Shape[]=[];
  for(let i=0;i<36;i++){
    const angle=i*Math.PI*2/36;
    const point=(x:number,y:number)=>new Vector2(Math.cos(angle+x/.372)*(.372+y),Math.sin(angle+x/.372)*(.372+y));
    const points=[[-.019,-.009],[.019,-.009],[.019,.009],[-.007,.009],[-.007,-.001],[.009,-.001]];
    for(let j=1;j<points.length;j++){
      const a=point(...points[j-1]! as [number,number]),b=point(...points[j]! as [number,number]);
      const d=b.clone().sub(a),n=new Vector2(-d.y,d.x).normalize().multiplyScalar(.0013);
      shapes.push(new Shape([a.clone().add(n),b.clone().add(n),b.clone().sub(n),a.clone().sub(n)]));
    }
  }
  const detail=new ExtrudeGeometry(shapes,{depth:.001,bevelEnabled:false});geometries.push(detail);
  const inlay=new Mesh(detail,ink);inlay.position.z=.0005;group.add(inlay);
  const star=sacredFlame(.350);
  star.holes.push(new Path(sacredFlame(.325).getPoints(48).reverse()));
  const starGeometry=new ExtrudeGeometry(star,{depth:.006,bevelEnabled:true,bevelSize:.001,bevelThickness:.001,bevelSegments:2,curveSegments:48});
  geometries.push(starGeometry);
  const frame=new Mesh(starGeometry,gold);frame.position.z=.017;frame.userData.kind='center-star-frame';group.add(frame);
  return group;
}
