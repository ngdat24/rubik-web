import {Color,MeshPhysicalMaterial,ShaderChunk,Vector2,Vector3,Vector4} from 'three';
import type {Texture} from 'three';
import {prometheus} from './prometheus-config.js';
import {stoneGlsl,stoneSeeds,stoneWindows} from './prometheus-stone.js';
import {solvingBrightness,solvingTileRect} from './prometheus-solving-atlas.js';

// Measured medallion offsets in the 1536×1024 atlas, image coordinates (right/down).
// Only the center tile is recentered. The rest of each face remains unchanged.
const medallionOffsets=[[0,-1],[0,0],[1,2],[1,-1],[1,0],[-4,2]] as const;
// The painted star sits slightly above the atlas cell center. Anchor the fire
// to its measured crossing, independently of the circular medallion's placement.
const starCentersPx=[[255,247],[768,247],[1280,247],[255,759],[769,759],[1277,759]] as const;

/** Intricate source medallion on its own centered round mesh, with no parallax drift. */
export function referenceMedallion(atlas:Texture,face:number,time:{value:number},solvedAmount:{value:number},wave:{value:number}){
  const material=new MeshPhysicalMaterial({map:atlas,bumpMap:atlas,bumpScale:.007,roughness:prometheus.fixedAppearance.roughness,
    metalness:.4,clearcoat:1,clearcoatRoughness:.055,emissive:0xffffff,emissiveMap:atlas,emissiveIntensity:.10});
  material.onBeforeCompile=shader=>{
    const palette=prometheus.faceFlames[face]!;
    shader.uniforms.centerFireTime=time;
    shader.uniforms.centerGoldWave=wave;
    shader.uniforms.centerSolvedAmount=solvedAmount;
    shader.uniforms.centerFireBase={value:new Color(palette.outer)};
    shader.uniforms.centerFireMid={value:new Color(palette.mid)};
    shader.uniforms.centerFireCore={value:new Color(palette.core)};
    const [starX,starY]=starCentersPx[face]!;
    const [x,y]=medallionOffsets[face]!;
    const oldCenter=new Vector2(face%3/3+1.5/9+x/1536,(face<3?.5:0)+1.5/6-y/1024);
    shader.uniforms.centerFireOffset={value:new Vector2(0,0)};
    shader.uniforms.medallionCenter={value:new Vector2(starX/1536,1-starY/1024)};
    shader.uniforms.solvedMedallionCenter={value:oldCenter};
    shader.uniforms.centerQuartz={value:new Vector2(face%3/3+1.5/9,(face<3?.5:0)+2.3/6)};
    shader.vertexShader='uniform vec2 medallionCenter,solvedMedallionCenter;uniform float centerSolvedAmount;varying vec2 centerStarUv;\n'+shader.vertexShader.replace('#include <uv_vertex>',`#include <uv_vertex>
      centerStarUv=uv-.5;
      vMapUv=medallionCenter+(uv-.5)*vec2(.92/9.,.92/6.);
      vBumpMapUv=vMapUv;vEmissiveMapUv=vMapUv;`);
    shader.fragmentShader=`uniform float centerFireTime,centerSolvedAmount,centerGoldWave;uniform vec3 centerFireBase,centerFireMid,centerFireCore;
      uniform vec2 centerFireOffset,centerQuartz;
      varying vec2 centerStarUv;
      float sacredFlow(vec2 p,float t){
        float warp=sin(p.y*13.-t*1.8)+.45*sin(p.x*19.+p.y*7.+t*.9);
        float a=.5+.5*sin(p.x*28.+warp*2.3-p.y*10.+t*2.1);
        float b=.5+.5*sin(p.x*43.-p.y*26.+sin(p.y*18.-t*2.6)*1.7+t*1.4);
        return a*.64+b*.36;
      }
    \n`+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
      vec2 sp=centerStarUv;
      vec3 centerStone=texture2D(map,centerQuartz+sp*vec2(.3/9.,.3/6.)).rgb;
      // No painted medallion survives: both ring and star frame are symmetric
      // geometry. The inset and live fire share the exact local origin (0,0).
      float keepMedallion=0.;
      diffuseColor.rgb=centerStone*.42;
      // Stay inside the four-point star, leaving its gold outline and ring untouched.
      float starDistance=sqrt(abs(sp.x))+sqrt(abs(sp.y));
      float starFill=1.-smoothstep(.59,.61,starDistance);
      float fireBody=sacredFlow(sp,centerFireTime);
      float deepBody=sacredFlow(sp*1.35+vec2(.07,.11),centerFireTime*.76);
      float hot=pow(fireBody,2.4);
      vec3 solidFlame=mix(centerFireBase,centerFireMid,.30+.60*fireBody);
      solidFlame=mix(solidFlame,centerFireCore,hot*.45+pow(deepBody,5.)*.18);
      diffuseColor.rgb=mix(diffuseColor.rgb,solidFlame,starFill);
    `);
    shader.fragmentShader=shader.fragmentShader.replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>
      totalEmissiveRadiance*=keepMedallion;
      totalEmissiveRadiance=mix(totalEmissiveRadiance,solidFlame*(.55+fireBody*.85),starFill);
      if(centerGoldWave>=0.)totalEmissiveRadiance+=vec3(1.,.55,.025)*(1.-smoothstep(.025,.12,abs(centerGoldWave-length(sp)*.836/2.12132034*.8)))*1.6;
    `);
    shader.fragmentShader=shader.fragmentShader.replace('#include <metalnessmap_fragment>',`#include <metalnessmap_fragment>
      metalnessFactor=.025;
      metalnessFactor=mix(metalnessFactor,.03,starFill);
    `);
    shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>','');
  };
  material.customProgramCacheKey=()=> 'prometheus-center-symmetric-live-fire-v6';return material;
}

/** One shared six-face atlas. Relief is sampled from that same image, not the rejected motif. */
export function referenceSurface(atlas:Texture,face:number,tile:number,unification:{amount:{value:number};wave:{value:number};floor:{value:number}},time:{value:number},solvingAtlas?:Texture){
  const material=new MeshPhysicalMaterial({map:atlas,bumpMap:atlas,bumpScale:.012,
    color:0xffffff,roughness:prometheus.fixedAppearance.roughness,metalness:.1,clearcoat:1,clearcoatRoughness:.055,ior:1.52,envMapIntensity:.8});
  material.onBeforeCompile=shader=>{
    shader.uniforms.ornamentAmount=unification.amount;shader.uniforms.ornamentWave=unification.wave;
    shader.uniforms.ornamentFloor=unification.floor;
    const seed=stoneSeeds[face*9+tile]!;
    shader.uniforms.stoneSeed={value:new Vector3(seed.x,seed.y,seed.angle)};
    shader.uniforms.stoneWindow={value:new Vector4(...stoneWindows[(face*9+tile)%4]!)};
    shader.uniforms.stoneTime=time;
    shader.uniforms.solvingAtlas={value:solvingAtlas??atlas};shader.uniforms.hasSolvingAtlas={value:solvingAtlas?1:0};
    shader.uniforms.solvingRect={value:solvingTileRect(face,tile)};
    shader.uniforms.solvingGemGain={value:solvingBrightness[face]!};
    shader.uniforms.referenceTile={value:new Vector2(tile%3,2-Math.floor(tile/3))};
    shader.uniforms.referenceFace={value:new Vector2(face%3/3,face<3?.5:0)};
    const [x,y]=tile===4?medallionOffsets[face]!:[0,0];
    shader.uniforms.referenceCenterOffset={value:new Vector2(x/1536,-y/1024)};
    shader.vertexShader='uniform vec2 referenceTile,referenceFace,referenceCenterOffset;\n'+shader.vertexShader.replace('#include <uv_vertex>',`#include <uv_vertex>
      vMapUv=referenceFace+(uv+referenceTile)*vec2(1./9.,1./6.)+referenceCenterOffset;
      vBumpMapUv=vMapUv;`);
    shader.fragmentShader=stoneGlsl+`uniform vec2 referenceTile,referenceFace,referenceCenterOffset;
      uniform float ornamentAmount,ornamentWave,ornamentFloor;
      uniform sampler2D solvingAtlas;uniform float hasSolvingAtlas,solvingGemGain;uniform vec4 solvingRect;
      float bronzeMask(vec3 rgb){
        vec3 c=pow(max(rgb,vec3(0.)),vec3(1./2.2));
        float rg=c.r/max(c.g,.001),gb=c.g/max(c.b,.001);
        return smoothstep(1.04,1.16,rg)*(1.-smoothstep(2.0,2.8,rg))*smoothstep(1.25,1.7,gb)*(1.-smoothstep(4.0,5.5,gb))*smoothstep(.15,.3,c.r);
      }
      float referenceHeight(sampler2D source,vec2 uv){vec3 c=texture2D(source,uv).rgb;return bronzeMask(c)*(.30+.65*dot(c,vec3(.2126,.7152,.0722)));}
    `+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`
      vec2 referenceUv=vMapUv;
      float anchoredCenter=1.-step(.1,length(referenceTile-vec2(1.)));
      vec2 capUv=(vMapUv-referenceCenterOffset-referenceFace)/vec2(1./9.,1./6.)-referenceTile;
      float ornamentRadius=length(referenceTile+capUv-vec2(1.5))/2.12132034;
      float ornamentVisibility=ornamentAmount;
      if(ornamentWave>=0.)ornamentVisibility=mix(ornamentFloor,1.,smoothstep(ornamentRadius*.80,ornamentRadius*.80+.20,ornamentWave));
      ornamentVisibility=mix(ornamentVisibility,1.,anchoredCenter);
      vec3 eye=normalize(vViewPosition);
      vec3 dx=dFdx(-vViewPosition),dy=dFdy(-vViewPosition);
      vec2 tx=dFdx(vMapUv),ty=dFdy(vMapUv);
      vec3 tangent=normalize(dx*ty.y-dy*tx.y),bitangent=normalize(dy*tx.x-dx*ty.x);
      vec3 n=normalize(cross(tangent,bitangent));
      vec2 delta=vec2(dot(eye,tangent),dot(eye,bitangent))/max(abs(dot(eye,n)),.35)*vec2(.004,.006)/12.;
      delta*=ornamentVisibility;
      float rayDepth=0.;
      if(anchoredCenter<.5){
        for(int i=0;i<12;i++){if(rayDepth>=1.-referenceHeight(map,referenceUv))break;referenceUv-=delta;rayDepth+=1./12.;}
      }
      vec2 cell=vec2(1./9.,1./6.);
      referenceUv=clamp(referenceUv,referenceFace+referenceTile*cell+.001,referenceFace+(referenceTile+1.)*cell-.001);
      vec4 sampledDiffuseColor=texture2D(map,referenceUv);
      if(anchoredCenter>.5){
        // Replace the painted medallion with clean quartz. The centered 3D children
        // provide its ring, recess and flame; there is no second shifted image below.
        vec2 local=(vMapUv-referenceCenterOffset-referenceFace)/cell-referenceTile-.5;
        vec2 quartzUv=referenceFace+(vec2(1.5,2.30)+local*.3)*cell;
        sampledDiffuseColor=texture2D(map,quartzUv);
      }
      float motif=anchoredCenter>.5?0.:bronzeMask(sampledDiffuseColor.rgb);
      float capEdge=min(min(capUv.x,capUv.y),min(1.-capUv.x,1.-capUv.y));
      float engravingInset=smoothstep(.035,.105,capEdge);
      vec3 baseStone=vec3(0.),quartz=vec3(0.),engraved=vec3(0.);
      vec2 stonePoint=vec2(0.);
      float vein=0.;
      // The live game keeps the original artwork. Skip the unused alternate
      // gemstone sampling and procedural noise while that artwork is fully visible.
      if(ornamentVisibility<1.){
      vec2 quartzCenter=referenceFace+vec2(1.5,2.30)*cell;
      baseStone=(texture2D(map,quartzCenter+vec2(.012,.006)).rgb+texture2D(map,quartzCenter-vec2(.012,.006)).rgb
        +texture2D(map,quartzCenter+vec2(-.009,.008)).rgb+texture2D(map,quartzCenter+vec2(.009,-.008)).rgb)*.25;
      stonePoint=stoneCoordinates(capUv);
      // Reuse the actual deep gemstone art, with a stable window and orientation
      // per sticker. Never replace it with flat averaged colors or polygon cracks.
      vec2 gemUv=referenceFace+stoneTextureUv(capUv)*cell;
      quartz=texture2D(map,gemUv).rgb;
      if(hasSolvingAtlas>.5)quartz=texture2D(solvingAtlas,solvingRect.xy+clamp(capUv,0.,1.)*solvingRect.zw).rgb;
      quartz*=solvingGemGain;
      float baseLuma=max(.015,dot(baseStone,vec3(.2126,.7152,.0722)));
      vein=smoothstep(1.25,2.8,dot(quartz,vec3(.2126,.7152,.0722))/baseLuma);
      engraved=quartz*(1.-motif*engravingInset*.16);
      }
      // Solved appearance is the original atlas in full, including its gemstone
      // depth and detailed raised bronze. The new stone applies only while solving.
      vec3 raised=sampledDiffuseColor.rgb;
      ${face===4?'raised*=mix(vec3(1.08,1.8,.50),vec3(1.),motif);quartz*=vec3(1.08,1.8,.50);engraved=quartz*(1.-motif*engravingInset*.16);':''}
      diffuseColor*=vec4(mix(engraved,raised,ornamentVisibility),sampledDiffuseColor.a);
      float referenceBronze=motif*ornamentVisibility;
      float referenceRelief=anchoredCenter>.5?0.:mix(-.0055*engravingInset,.012,ornamentVisibility)*referenceHeight(map,referenceUv);
    `);
    shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>','float roughnessFactor=mix(.045+motif*engravingInset*.07,roughness,ornamentVisibility);');
    shader.fragmentShader=shader.fragmentShader.replace('#include <metalnessmap_fragment>','float metalnessFactor=mix(.025,.88,referenceBronze);');
    shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',ShaderChunk.normal_fragment_maps.replace('dHdxy_fwd()','vec2(dFdx(referenceRelief),dFdy(referenceRelief))'));
    shader.fragmentShader=shader.fragmentShader.replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>
      vec2 p=(referenceUv-referenceCenterOffset-referenceFace)/vec2(1./3.,.5)*3.-referenceTile-.5;
      float center=1.-step(.1,length(referenceTile-vec2(1.)));
      float star=1.-smoothstep(.51,.58,sqrt(abs(p.x))+sqrt(abs(p.y)));
      // Center emission is supplied by the physical flame mesh at local (0,0).
      float veinLight=.035+.025*sin(stoneTime*.55+dot(stonePoint,vec2(1.9,1.2)));
      totalEmissiveRadiance+=mix(baseStone,vec3(1.),.18)*vein*veinLight*(1.-ornamentVisibility);
      if(ornamentWave>=0.&&anchoredCenter<.5){
        float front=1.-smoothstep(.025,.12,abs(ornamentWave-ornamentRadius*.80));
        totalEmissiveRadiance+=vec3(1.,.47,.015)*motif*front*.42;
      }
    `);
  };
  material.customProgramCacheKey=()=> 'prometheus-solving-reference-cells-v9-'+face;return material;
}
