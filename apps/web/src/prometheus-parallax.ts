import {ShaderChunk} from 'three';
import type {Texture} from 'three';

interface Shader {fragmentShader:string;uniforms:Record<string,{value:unknown}>}
/** All channels sample one marched UV; the bronze never drifts away from its normal/AO. */
export function prometheusParallax(shader:Shader,height:Texture|null,enabled:{value:number},scale:{value:number}){
  shader.uniforms.studyHeight={value:height};shader.uniforms.studyPom=enabled;shader.uniforms.studyDepth=scale;
  shader.fragmentShader=`uniform sampler2D studyHeight;
    uniform float studyPom;
    uniform float studyDepth;
    uniform vec2 studyTile;
  `+shader.fragmentShader;
  shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`
    vec2 studyUv=vMapUv;
    if(studyPom>.5){
      vec3 eye=normalize(vViewPosition);
      vec3 dx=dFdx(-vViewPosition),dy=dFdy(-vViewPosition);
      vec2 tx=dFdx(vMapUv),ty=dFdy(vMapUv);
      vec3 tangent=normalize(dx*ty.y-dy*tx.y);
      vec3 bitangent=normalize(dy*tx.x-dx*ty.x);
      vec3 n=normalize(cross(tangent,bitangent));
      vec3 direction=vec3(dot(eye,tangent),dot(eye,bitangent),abs(dot(eye,n)));
      vec2 delta=direction.xy/max(direction.z,.3)*studyDepth/12.;
      float rayDepth=0.;
      vec2 previous=studyUv;
      float previousSurface=1.-texture2D(studyHeight,studyUv).r;
      for(int step=0;step<12;step++){
        float surface=1.-texture2D(studyHeight,studyUv).r;
        if(rayDepth>=surface)break;
        previous=studyUv;previousSurface=surface;
        studyUv-=delta;rayDepth+=1./12.;
      }
      float after=(1.-texture2D(studyHeight,studyUv).r)-rayDepth;
      float before=previousSurface-(rayDepth-1./12.);
      float weight=clamp(after/min(after-before,-.00001),0.,1.);
      studyUv=mix(studyUv,previous,weight);
      // Never sample the neighbouring cubie's ornament at grazing angles.
      studyUv=clamp(studyUv,studyTile/3.+.0015,(studyTile+1.)/3.-.0015);
    }
    diffuseColor*=texture2D(map,studyUv);
  `);
  const chunks=[
    ['roughnessmap_fragment','vRoughnessMapUv'],['metalnessmap_fragment','vMetalnessMapUv'],
    ['normal_fragment_maps','vNormalMapUv'],['aomap_fragment','vAoMapUv']
  ] as const;
  for(const [chunk,uv] of chunks)shader.fragmentShader=shader.fragmentShader.replace('#include <'+chunk+'>',ShaderChunk[chunk].replaceAll(uv,'studyUv'));
  shader.fragmentShader=shader.fragmentShader.replace('texture2D(emissiveMap,vEmissiveMapUv)','texture2D(emissiveMap,studyUv)');
}
