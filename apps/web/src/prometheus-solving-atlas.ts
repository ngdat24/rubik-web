import {MeshPhysicalMaterial,MeshStandardMaterial,Vector4} from 'three';
import type {Texture} from 'three';
export const solvingBrightness=[1,1,1,1.08,1,1] as const;

/** Each original reference cell is sampled directly, inset beyond its gold frame.
 * Face order U/R/F/D/L/B; the image itself is copied without editing/resampling.
 */
export function solvingTileRect(face:number,tile:number):Vector4{
  const x=face%3*236+10+tile%3*77;
  const y=(face<3?9:247)+Math.floor(tile/3)*77;
  return new Vector4(x/708,1-(y+65)/477,65/708,65/477);
}

/** Gameplay's second form samples the gemstone directly, without relief/noise shaders. */
export function lightweightSolvingSurface(atlas:Texture,face:number,tile:number,original:Texture,amount:{value:number}){
  const material=new MeshStandardMaterial({map:atlas,roughness:.16,metalness:.025,
    color:0xffffff,envMapIntensity:.8});
  material.onBeforeCompile=shader=>{
    shader.uniforms.gemRect={value:solvingTileRect(face,tile)};
    shader.uniforms.originalAtlas={value:original};shader.uniforms.originalAmount=amount;
    const center=tile===4;
    shader.uniforms.originalRect={value:new Vector4(face%3/3+(center?1.35:tile%3)/9,
      (face<3?.5:0)+(center?2.15:2-Math.floor(tile/3))/6,(center?.3:1)/9,(center?.3:1)/6)};
    shader.vertexShader='uniform vec4 gemRect,originalRect;varying vec2 originalUv;\n'+shader.vertexShader.replace('#include <uv_vertex>',
      '#include <uv_vertex>\n vMapUv=gemRect.xy+uv*gemRect.zw;originalUv=originalRect.xy+uv*originalRect.zw;');
    shader.fragmentShader='uniform sampler2D originalAtlas;uniform float originalAmount;varying vec2 originalUv;\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
      ${face===4?'diffuseColor.rgb*=vec3(1.08,1.8,.50);':''}
      if(originalAmount>0.)diffuseColor.rgb=mix(diffuseColor.rgb,texture2D(originalAtlas,originalUv).rgb,originalAmount);
    `);
  };
  material.customProgramCacheKey=()=> 'prometheus-lightweight-gem-v2-'+face;
  return material;
}

/** Keep the solved rim unchanged; its solving counterpart is solid colored gem. */
export function solvingGemRim(atlas:Texture,face:number,tile:number,amount:{value:number}){
  const material=new MeshPhysicalMaterial({color:0x120406,roughness:.16,metalness:.25,opacity:.96,transparent:true});
  material.onBeforeCompile=shader=>{
    shader.uniforms.rimGemAtlas={value:atlas};shader.uniforms.rimGemRect={value:solvingTileRect(face,tile)};
    shader.uniforms.rimSolvedAmount=amount;
    shader.uniforms.rimGemGain={value:solvingBrightness[face]!};
    shader.vertexShader='varying vec2 rimGemUv;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n rimGemUv=position.xy+.5;');
    shader.fragmentShader='uniform sampler2D rimGemAtlas;uniform vec4 rimGemRect;uniform float rimSolvedAmount,rimGemGain;varying vec2 rimGemUv;\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
      vec3 rimStone=texture2D(rimGemAtlas,rimGemRect.xy+clamp(rimGemUv,0.,1.)*rimGemRect.zw).rgb;
      rimStone*=rimGemGain;
      diffuseColor.rgb=mix(rimStone,diffuseColor.rgb,rimSolvedAmount);
      diffuseColor.a=mix(1.,diffuseColor.a,rimSolvedAmount);
    `);
    shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>','float roughnessFactor=mix(.045,roughness,rimSolvedAmount);');
  };
  material.customProgramCacheKey=()=> 'prometheus-gem-filled-rim-v1';return material;
}
