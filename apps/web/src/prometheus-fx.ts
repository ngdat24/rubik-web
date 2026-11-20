import {AdditiveBlending,BufferAttribute,BufferGeometry,Color,DoubleSide,DynamicDrawUsage,Group,Mesh,MeshBasicMaterial,Points,ShaderMaterial,TorusGeometry,Vector3} from 'three';
import type {Camera,Object3D,WebGLRenderer} from 'three';
import {parseMove} from '@rubik/engine';
import {rotationFor} from '@rubik/renderer';
import {prometheus as config} from './prometheus-config.js';
import {bloomAmount} from './prometheus-bloom.js';

interface Spark {p:Vector3;v:Vector3;birth:number;life:number;size:number}
export function prometheusFx(scene:Object3D,reduced=matchMedia('(prefers-reduced-motion: reduce)').matches,style:'fire'|'ice'='fire'){
  let enabled=!reduced;
  const ice=style==='ice';
  const root=new Group();scene.add(root);
  const ribbons:{mesh:Mesh<BufferGeometry,ShaderMaterial>;born:number;axis:Vector3;center:Vector3;angle:number}[]=[];
  const flashes:{mesh:Mesh<BufferGeometry,MeshBasicMaterial>;born:number}[]=[];
  let sparks:Spark[]=[],solveStart=-Infinity;
  const particleGeometry=new BufferGeometry(),particleMaterial=new ShaderMaterial({transparent:true,depthWrite:false,blending:AdditiveBlending,
    vertexShader:`attribute float size;attribute float life;varying float age;void main(){age=life;vec4 p=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*p;gl_PointSize=size;}`,
    fragmentShader:`varying float age;void main(){float r=length(gl_PointCoord-.5)*2.;if(r>1.)discard;
      vec3 c=mix(vec3(1.,.95,.69),vec3(1.,.165,.333),age);gl_FragColor=vec4(c,(1.-r*r)*(1.-age));}`
  });
  const particles=new Points(particleGeometry,particleMaterial);particles.frustumCulled=false;root.add(particles);
  // At most 256 turn sparks plus the unchanged 64 solve particles.
  const positions=new BufferAttribute(new Float32Array(320*3),3).setUsage(DynamicDrawUsage);
  const sizes=new BufferAttribute(new Float32Array(320),1).setUsage(DynamicDrawUsage);
  const lives=new BufferAttribute(new Float32Array(320),1).setUsage(DynamicDrawUsage);
  particleGeometry.setAttribute('position',positions);particleGeometry.setAttribute('size',sizes);particleGeometry.setAttribute('life',lives);particleGeometry.setDrawRange(0,0);
  const waveStartColor=new Color(0xff2a55),waveEndColor=new Color(0xfff3b0);
  const waveGeometry=new TorusGeometry(1,.055,6,64),waveMaterial=new MeshBasicMaterial({color:0xffb703,transparent:true,opacity:0,depthWrite:false,blending:AdditiveBlending});
  const wave=new Mesh(waveGeometry,waveMaterial);wave.rotation.x=Math.PI/2;wave.visible=false;root.add(wave);
  const removeRibbon=()=>{const item=ribbons.shift();if(item){root.remove(item.mesh);item.mesh.geometry.dispose();item.mesh.material.dispose();}};
  function turn(move:string,now:number,camera:Vector3,size=3,turnAngle?:number){
    if(!enabled)return;
    const parsed=parseMove(move,size),rotation=rotationFor(parsed),normal=new Vector3(...rotation.axis);
    const angle=turnAngle??rotation.angle;
    const cell=3/size;
    const coordinate=((size+1)/2-(parsed.layerStart+parsed.layerEnd)/2)*cell;
    const center=normal.clone().multiplyScalar(coordinate);
    const u=new Vector3(...(parsed.axis==='x'?[0,1,0] as const:[1,0,0] as const));
    const v=new Vector3().crossVectors(normal,u),facing=camera.clone().sub(center);
    const startAngle=Math.atan2(facing.dot(v),facing.dot(u)),sign=Math.sign(angle);
    const scale=ice ? 1.15 : 1;
    const span=Math.PI*.57*scale;
    const positions:number[]=[],ages:number[]=[],indices:number[]=[],across:number[]=[],facets:number[]=[],segments=30;
    const point=(theta:number,radius:number,height=0)=>u.clone().multiplyScalar(Math.cos(theta)*radius)
      .addScaledVector(v,Math.sin(theta)*radius).addScaledVector(normal,height).add(center);
    const vertex=(p:Vector3,age:number,edge:number,facet:number)=>{
      positions.push(...p.toArray());ages.push(age);across.push(edge);facets.push(facet);
    };
    for(let i=0;i<=segments;i++){
      const t=i/segments,theta=startAngle-sign*(1-t)*span;
      const width=(ice ? .41 : .13)*scale*config.turn.widthScale*Math.sin(Math.PI*t)*(.65+.35*t);
      const flameExtent=ice ? 2.35 : 1;
      for(const side of [-1,1]){
        const offset=width*side*flameExtent;
        vertex(point(theta,1.88+offset,ice?offset*.55:0),1-t,side*flameExtent,0);
      }
      if(i<segments){const k=i*2;indices.push(k,k+1,k+2,k+1,k+3,k+2);}
    }
    if(ice)for(const [along,height,length,width,white] of [
      [.09,.13,.14,.085,0],[.19,-.18,.19,.09,1],[.28,.22,.17,.12,0],
      [.39,.14,.20,.105,1],[.47,-.19,.16,.105,0],[.56,.25,.13,.075,1],
      [.65,-.13,.12,.07,1],[.74,.15,.17,.08,0],[.83,-.15,.16,.09,1],
      [.87,.25,.22,.12,1],[.94,-.12,.19,.10,0],[.98,.22,.10,.064,1],
      [.925,.065,.29,.145,1],
    ] as const){
      const theta=startAngle-sign*(1-along)*span;
      const corner=[[-length, -width*.16],[-length*.15,width],[length,width*.24],[length*.13,-width]] as const;
      const shardPoint=(angle:number,y:number)=>point(theta+sign*angle*1.25*scale,2.15+y*.55*scale,(height*1.2+y*1.25)*scale);
      const mid=shardPoint(0,0);
      for(let i=0;i<4;i++){
        const [x,y]=corner[i]!,[nx,ny]=corner[(i+1)%4]!;
        const outer=shardPoint(x,y),next=shardPoint(nx,ny);
        const inner=shardPoint(.73*x,.73*y),innerNext=shardPoint(.73*nx,.73*ny);
        for(const [a,b,c,palette] of [[outer,next,inner,1],[inner,next,innerNext,1],
          [inner,innerNext,mid,i===0?3:i===2?2:white?4:3]] as const){
          const k=ages.length;
          for(const p of [a,b,c])vertex(p,1-along,0,palette);
          indices.push(k,k+1,k+2);
        }
        const flame=ages.length;
        vertex(outer,i/4,0,5);
        vertex(next,(i+1)/4,0,5);
        vertex(shardPoint(1.85*x,1.85*y),i/4,1,5);
        vertex(shardPoint(1.85*nx,1.85*ny),(i+1)/4,1,5);
        indices.push(flame,flame+1,flame+2,flame+1,flame+3,flame+2);
      }
    }
    const geometry=new BufferGeometry();geometry.setAttribute('position',new BufferAttribute(new Float32Array(positions),3));geometry.setAttribute('age',new BufferAttribute(new Float32Array(ages),1));geometry.setIndex(indices);
    if(ice){
      geometry.setAttribute('across',new BufferAttribute(new Float32Array(across),1));
      geometry.setAttribute('facet',new BufferAttribute(new Float32Array(facets),1));
    }
    const material=new ShaderMaterial({transparent:true,depthWrite:false,side:DoubleSide,...(ice?{}:{blending:AdditiveBlending}),uniforms:{fade:{value:1}},
      vertexShader:ice?
        'attribute float age,across,facet;varying float t,w,f;void main(){t=age;w=across;f=facet;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}':
        'attribute float age;varying float t;void main(){t=age;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader:ice?`uniform float fade;varying float t,w,f;
      float flameCoverage(float distance,float phase,float side){
        float motion=(1.-fade)*6.;
        float curl=phase*56.548668+side*5.-motion;
        float tongues=pow(.5+.5*sin(curl),2.2);
        float wisps=pow(.5+.5*sin(phase*94.24778-side*8.-motion*1.6),3.);
        float crest=.24+.49*tongues+.20*wisps;
        return (1.-smoothstep(crest*.62,crest,distance))*(.88-.34*distance);
      }
      void main(){
        vec3 navy=vec3(.025,.13,.39),blue=vec3(.07,.49,1.),cyan=vec3(.16,.94,1.),white=vec3(.98,1.,1.);
        float edge=abs(w);
        vec3 c=f>3.5?white:f>2.5?cyan:f>1.5?blue:navy;
        float alpha=fade;
        if(f>4.5){
          c=mix(mix(white,cyan,smoothstep(0.,.36,w)),blue,smoothstep(.26,.88,w));
          alpha*=max(.61*(1.-smoothstep(0.,.43,w)),flameCoverage(w,t,w));
        }else if(f<.5){
          c=edge>.72?blue:edge>.64?navy:edge>.43?blue:edge>.14?cyan:white;
          alpha*=1.-.28*smoothstep(.65,1.,t);
          if(edge>.72){
            float distance=(edge-.72)/1.63;
            c=mix(mix(white,cyan,smoothstep(0.,.32,distance)),blue,smoothstep(.24,.88,distance));
            alpha*=flameCoverage(distance,t,w);
          }
        }
        gl_FragColor=vec4(c,alpha);
      }`:`uniform float fade;varying float t;void main(){vec3 c;float alpha;
      if(t<.35){c=mix(vec3(1.,.953,.69),vec3(1.,.718,.012),t/.35);alpha=mix(.95,.8,t/.35);}
      else if(t<.75){c=mix(vec3(1.,.718,.012),vec3(1.,.165,.333),(t-.35)/.4);alpha=mix(.8,.45,(t-.35)/.4);}
      else{c=mix(vec3(1.,.165,.333),vec3(.169,.035,.055),(t-.75)/.25);alpha=.45*(1.-(t-.75)/.25);}
      gl_FragColor=vec4(c,alpha*fade);}`
    });
    const mesh=new Mesh(geometry,material);root.add(mesh);ribbons.push({mesh,born:now,axis:normal,center,angle});if(ribbons.length>8)removeRibbon();
    for(let i=0;i<(ice?0:config.turn.sparks);i++){
      const a=i%4,x=a%2?1.5:-1.5,y=a<2?1.5:-1.5,p=center.clone().addScaledVector(u,x).addScaledVector(v,y);
      const tangent=new Vector3().crossVectors(normal,p.clone().sub(center)).normalize().multiplyScalar(sign*config.turn.velocity);
      tangent.y+=config.turn.buoyancy;
      sparks.push({p,v:tangent,birth:now,life:config.turn.life[0]+Math.random()*(config.turn.life[1]-config.turn.life[0]),size:2+Math.random()*3.5});
    }
    const cut=center.clone().addScaledVector(normal,-Math.sign(coordinate)*cell/2),verts:number[]=[];
    for(const [a,b] of [[[-1.5,-1.5],[1.5,-1.5]],[[1.5,-1.5],[1.5,1.5]],[[1.5,1.5],[-1.5,1.5]],[[-1.5,1.5],[-1.5,-1.5]]] as const){
      const pa=cut.clone().addScaledVector(u,a[0]).addScaledVector(v,a[1]),pb=cut.clone().addScaledVector(u,b[0]).addScaledVector(v,b[1]);
      const n=new Vector3().subVectors(pb,pa).cross(normal).normalize().multiplyScalar(.009);
      for(const p of [pa.clone().add(n),pa.clone().sub(n),pb.clone().add(n),pa.clone().sub(n),pb.clone().sub(n),pb.clone().add(n)])verts.push(...p.toArray());
    }
    const flashGeo=new BufferGeometry();flashGeo.setAttribute('position',new BufferAttribute(new Float32Array(verts),3));
    const flash=new Mesh(flashGeo,new MeshBasicMaterial({color:ice?0x8ef0ff:0xffb703,transparent:true,opacity:1,side:DoubleSide,depthWrite:false,blending:AdditiveBlending}));
    root.add(flash);flashes.push({mesh:flash,born:now});
    sparks=sparks.slice(-256);
  }
  function solve(now:number){if(enabled)solveStart=now;}
  let last=0;
  function update(now:number){
    const dt=Math.min(.05,Math.max(0,(now-last)/1000));last=now;
    for(const item of ribbons){const t=(now-item.born)/config.turn.duration;
      item.mesh.material.uniforms.fade!.value=Math.max(0,1-t);
      // Rotation is around the actual layer axis in world space, not screen-space CSS.
      item.mesh.quaternion.setFromAxisAngle(item.axis,item.angle*Math.min(1,t));
    }
    while(ribbons.length&&now-ribbons[0]!.born>=config.turn.duration)removeRibbon();
    for(let i=flashes.length-1;i>=0;i--){const f=flashes[i]!,t=(now-f.born)/config.turn.flashMs;f.mesh.material.opacity=Math.max(0,1-t);if(t>=1){root.remove(f.mesh);f.mesh.geometry.dispose();f.mesh.material.dispose();flashes.splice(i,1);}}
    let alive=0;
    for(const spark of sparks)if(now-spark.birth<spark.life)sparks[alive++]=spark;
    sparks.length=alive;
    let count=0;
    const particle=(x:number,y:number,z:number,size:number,life:number)=>{positions.setXYZ(count,x,y,z);sizes.setX(count,size);lives.setX(count,life);count++;};
    for(const s of sparks){s.v.multiplyScalar(Math.pow(config.turn.drag,dt*60));s.v.y+=config.turn.buoyancy*dt;s.p.addScaledVector(s.v,dt);particle(s.p.x,s.p.y,s.p.z,s.size,(now-s.birth)/s.life);}
    const elapsed=now-solveStart,solveActive=elapsed>=0&&elapsed<config.solve.duration;
    if(solveActive&&elapsed>=1300){
      const t=(elapsed-1300)/(config.solve.duration-1300);
      for(let i=0;i<64;i++){
        const angle=i*2.39996+t*4.2,r=.5+((i*17)%43)/43*1.2;
        const y=-1.4+(i%11)/11*2.8+t*1.4;
        particle(Math.cos(angle)*r,y,Math.sin(angle)*r,2+(i%4),Math.max(0,(elapsed-(config.solve.duration-500))/500));
      }
    }
    particleGeometry.setDrawRange(0,count);
    if(count)for(const attribute of [positions,sizes,lives]){attribute.clearUpdateRanges();attribute.addUpdateRange(0,count*attribute.itemSize);attribute.needsUpdate=true;}
    wave.visible=solveActive&&elapsed>=config.solve.waveStart&&elapsed<config.solve.waveEnd;
    if(wave.visible){const t=(elapsed-config.solve.waveStart)/(config.solve.waveEnd-config.solve.waveStart);wave.scale.setScalar(.1+3.1*(1-Math.pow(1-t,3)));waveMaterial.opacity=1-t;waveMaterial.color.copy(waveStartColor).lerp(waveEndColor,t);}
    if(!solveActive)return 0;
    const fade=Math.min(1,(config.solve.duration-elapsed)/500);
    return (elapsed<250?2.8*(1-elapsed/250):.9+1.9*bloomAmount(elapsed))*fade;
  }
  const clear=()=>{while(ribbons.length)removeRibbon();for(const f of flashes){root.remove(f.mesh);f.mesh.geometry.dispose();f.mesh.material.dispose();}flashes.length=0;sparks=[];particleGeometry.setDrawRange(0,0);solveStart=-Infinity;wave.visible=false;};
  return {turn,solve,update,clear,
    get turnActive(){return ribbons.length>0||flashes.length>0||sparks.length>0;},
    prewarm(renderer:WebGLRenderer,camera:Camera){const visible=wave.visible;wave.visible=true;renderer.compile(scene,camera);wave.visible=visible;},
    setEnabled(value:boolean){enabled=value&&!reduced;if(!enabled)clear();},dispose(){clear();particleGeometry.dispose();particleMaterial.dispose();waveGeometry.dispose();waveMaterial.dispose();scene.remove(root);}};
}
