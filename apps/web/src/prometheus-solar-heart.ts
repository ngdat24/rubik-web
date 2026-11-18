import {AdditiveBlending,CanvasTexture,CylinderGeometry,Group,Mesh,MeshBasicMaterial,MeshPhysicalMaterial,RingGeometry,ShaderMaterial,SphereGeometry,Sprite,SpriteMaterial,SRGBColorSpace,TorusGeometry,Vector3} from 'three';

// Fictional angular inscriptions inspired by the reference, not a translation.
const solarRunes=[
  [[-.28,.4],[0,-.4],[.28,.4]],
  [[-.25,.4],[-.25,-.4],[.25,-.4],[.25,0],[-.25,0],[.28,.4]],
  [[-.25,-.4],[0,0],[.25,-.4],[0,0],[0,.4]],
  [[.25,-.4],[-.25,-.4],[-.25,.4],[.25,.4],[-.25,.4],[-.25,0],[.15,0]],
  [[-.25,.4],[-.25,-.4],[.25,-.4],[.25,.4]],
  [[-.25,-.4],[.25,-.4],[-.15,0],[.25,0],[-.25,.4]],
  [[0,-.4],[.28,0],[0,.4],[-.28,0],[0,-.4],[0,.4]],
  [[-.28,.4],[0,-.4],[.28,.4],[.15,.12],[-.15,.12]],
] as const;
function drawSolarRune(ctx:CanvasRenderingContext2D,index:number,x:number,y:number,size:number,color:string,width:number){
  ctx.save();ctx.translate(x,y);ctx.strokeStyle=color;ctx.lineWidth=width;ctx.lineCap='square';ctx.lineJoin='miter';
  ctx.beginPath();solarRunes[index%solarRunes.length]!.forEach(([px,py],i)=>{if(i===0)ctx.moveTo(px*size,py*size);else ctx.lineTo(px*size,py*size);});ctx.stroke();ctx.restore();
}

export function solarHeart(){
  const root=new Group();root.userData.kind='caged-solar-heart';
  const plasma=new ShaderMaterial({uniforms:{time:{value:0},burst:{value:0}},
    vertexShader:`uniform float time;varying vec3 solarPoint;varying vec3 solarNormal;varying vec3 solarView;
      void main(){solarPoint=position;solarNormal=normalize(normalMatrix*normal);
      vec3 p=position*(1.+.018*sin(position.x*23.+time*1.1)*sin(position.y*19.-time*.9));
      vec4 view=modelViewMatrix*vec4(p,1.);solarView=normalize(-view.xyz);gl_Position=projectionMatrix*view;}`,
    fragmentShader:`uniform float time,burst;varying vec3 solarPoint,solarNormal,solarView;
      float hash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
      float noise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
      return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}
      void main(){vec3 p=solarPoint*13.+vec3(0.,-time*.25,time*.13);
      float convection=noise(p)*.55+noise(p*2.03)*.30+noise(p*4.07)*.15;
      float cells=pow(1.-abs(convection*2.-1.),4.);
      vec3 color=mix(vec3(.55,.025,.002),vec3(1.,.48,.015),cells);
      color=mix(color,vec3(1.,.91,.52),pow(cells,5.)*.55+burst*.38);
      float limb=.55+.45*max(0.,dot(normalize(solarNormal),normalize(solarView)));
      gl_FragColor=vec4(color*limb*(1.1+burst*1.7),1.);}`});
  const globe=new SphereGeometry(.42,28,20);root.add(new Mesh(globe,plasma));
  // Match circumference/band-height texel density so letters are not stretched.
  const canvas=document.createElement('canvas');canvas.width=4096;canvas.height=128;const ctx=canvas.getContext('2d')!;
  ctx.fillStyle='#D6A52B';ctx.fillRect(0,0,4096,128);
  const mask=document.createElement('canvas');mask.width=4096;mask.height=128;const ink=mask.getContext('2d')!;
  ink.fillStyle='#000';ink.fillRect(0,0,4096,128);
  for(let i=0;i<40;i++){const x=(i+.5)*4096/40;
    const index=(i*5+Math.floor(i/8))%8;
    drawSolarRune(ctx,index,x,64,104,'#67400A',11);
    drawSolarRune(ctx,index,x,64,104,'#FFF4C2',6);
    drawSolarRune(ink,index,x,64,104,'#FFF4C2',6);}
  const texture=new CanvasTexture(canvas);texture.colorSpace=SRGBColorSpace;
  const emission=new CanvasTexture(mask);emission.colorSpace=SRGBColorSpace;
  const gold=new MeshPhysicalMaterial({color:0xffd166,metalness:1,roughness:.18,emissive:0xffb703,emissiveIntensity:.12,side:2});
  const glyph=new MeshPhysicalMaterial({map:texture,emissiveMap:emission,emissive:0xffdf80,emissiveIntensity:1.5,metalness:1,roughness:.18,side:2});
  // Preserve band width .17; double radial metal thickness .03 -> .06.
  const torus=new TorusGeometry(.94,.015,6,72),band=new CylinderGeometry(.94,.94,.17,72,1,true);
  const innerBand=new CylinderGeometry(.88,.88,.17,72,1,true),rimFace=new RingGeometry(.88,.94,72);
  const tilts=[[.35,0,.55],[-.50,.60,-.65],[1.,-.35,.20]];
  for(let i=0;i<3;i++){const ring=new Group();ring.userData.kind='solar-magnetic-ring';ring.add(new Mesh(band,glyph));
    const inner=new Mesh(innerBand,gold);ring.add(inner);
    for(const y of [-.085,.085]){
      const edge=new Mesh(rimFace,gold);edge.rotation.x=y>0?-Math.PI/2:Math.PI/2;edge.position.y=y;ring.add(edge);
      const lip=new Mesh(torus,gold);lip.rotation.x=Math.PI/2;lip.position.y=y;ring.add(lip);
    }
    ring.rotation.set(...tilts[i]! as [number,number,number]);root.add(ring);}
  const coronaGeometry=new SphereGeometry(.49,24,16);
  const corona=new ShaderMaterial({uniforms:plasma.uniforms,transparent:true,depthWrite:false,blending:AdditiveBlending,
    vertexShader:`uniform float time;varying vec3 cp;varying vec3 cn;varying vec3 cv;
      void main(){cp=position;cn=normalize(normalMatrix*normal);vec3 p=position*(1.+.09*sin(position.y*32.-time*.9)*sin(position.x*27.+time*.7));
      vec4 v=modelViewMatrix*vec4(p,1.);cv=normalize(-v.xyz);gl_Position=projectionMatrix*v;}`,
    fragmentShader:`uniform float time,burst;varying vec3 cp,cn,cv;
      void main(){float rim=pow(1.-abs(dot(normalize(cn),normalize(cv))),1.7);
      float wisps=pow(.5+.5*sin(cp.y*39.-time*1.15+sin(cp.x*31.+cp.z*24.+time*.6)*2.),2.);
      gl_FragColor=vec4(mix(vec3(1.,.16,.008),vec3(1.,.72,.12),wisps),rim*(.16+.38*wisps)*(1.+burst*.7));}`});
  const coronaMesh=new Mesh(coronaGeometry,corona);coronaMesh.userData.kind='solar-smoldering-corona';root.add(coronaMesh);
  const glyphTextures=Array.from({length:8},(_,index)=>{
    const c=document.createElement('canvas');c.width=c.height=128;const g=c.getContext('2d')!;
    g.shadowColor='#FFB703';g.shadowBlur=10;drawSolarRune(g,index,64,64,110,'#FFF3B0',6);
    const t=new CanvasTexture(c);t.colorSpace=SRGBColorSpace;return t;
  });
  const runes=Array.from({length:24},(_,i)=>{
    const a=i*2.39996323,y=1-2*(i+.5)/24,r=Math.sqrt(1-y*y);
    const direction=new Vector3(Math.cos(a)*r,y,Math.sin(a)*r);
    const material=new SpriteMaterial({map:glyphTextures[i%8]!,color:0xffd76a,transparent:true,depthWrite:false,blending:AdditiveBlending});
    const sprite=new Sprite(material);sprite.userData.kind='solar-burst-rune';sprite.visible=false;root.add(sprite);
    return {sprite,material,direction};
  });
  const halo=new Group();halo.userData.kind='solar-360-halo';root.add(halo);
  const haloGeometry=new TorusGeometry(1,.025,6,64),haloMaterial=new MeshBasicMaterial({color:0xffc947,transparent:true,opacity:0,depthWrite:false,blending:AdditiveBlending});
  for(let i=0;i<3;i++){const wave=new Mesh(haloGeometry,haloMaterial);if(i===1)wave.rotation.x=Math.PI/2;if(i===2)wave.rotation.y=Math.PI/2;halo.add(wave);}
  return {root,update(now:number,elapsed:number|undefined){
    plasma.uniforms.time!.value=now/1000;
    // Smooth ignition, peak at full opening, then a slow return during closing.
    const burst=elapsed===undefined?0:elapsed<1300?Math.sin(Math.max(0,elapsed)/1300*Math.PI/2):Math.pow(Math.max(0,1-(elapsed-1300)/2300),2);
    plasma.uniforms.burst!.value=burst;gold.emissiveIntensity=.12+burst*.6;glyph.emissiveIntensity=1.5+burst*1.8;
    const haloTime=elapsed===undefined?-1:(elapsed-250)/3100;
    halo.visible=haloTime>=0&&haloTime<=1;
    if(halo.visible){halo.scale.setScalar(.65+(1-Math.pow(1-haloTime,3))*1.8);haloMaterial.opacity=Math.sin(Math.PI*haloTime)*.45;}
    for(let i=0;i<runes.length;i++){
      const rune=runes[i]!,t=elapsed===undefined?-1:(elapsed-250-i%4*80)/2900;
      rune.sprite.visible=t>=0&&t<=1;
      if(rune.sprite.visible){const ease=1-Math.pow(1-t,3);
        rune.sprite.position.copy(rune.direction).multiplyScalar(.72+ease*1.45);
        rune.sprite.scale.setScalar(.12+Math.sin(Math.PI*t)*.13);
        rune.material.opacity=Math.sin(Math.PI*t)*.9;
      }
    }
    root.scale.setScalar(1+burst*.055);return burst;
  },dispose(){innerBand.dispose();rimFace.dispose();coronaGeometry.dispose();corona.dispose();emission.dispose();haloGeometry.dispose();haloMaterial.dispose();globe.dispose();torus.dispose();band.dispose();plasma.dispose();gold.dispose();glyph.dispose();texture.dispose();glyphTextures.forEach(t=>t.dispose());runes.forEach(r=>r.material.dispose());}};
}
