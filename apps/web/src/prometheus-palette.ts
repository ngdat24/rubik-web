import {Color,ShaderMaterial} from 'three';
import type {prometheus} from './prometheus-config.js';
type Palette=typeof prometheus.faceFlames[number];
export const flameColorGlsl=`
  uniform vec3 sacredCore,sacredMid,sacredOuter;
  vec3 sacredFlameColor(vec2 p){
    float r=length(p);
    vec3 color=mix(sacredMid,sacredOuter,smoothstep(.10,.29,r));
    return mix(color,sacredCore,1.-smoothstep(.025,.115,r));
  }
`;
export const paletteUniforms=(palette:Palette)=>({sacredCore:{value:new Color(palette.core)},sacredMid:{value:new Color(palette.mid)},sacredOuter:{value:new Color(palette.outer)}});
export function flatFlameMaterial(palette:Palette){
  return new ShaderMaterial({uniforms:paletteUniforms(palette),
    vertexShader:'varying vec2 sacredXY;void main(){sacredXY=position.xy;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:flameColorGlsl+`varying vec2 sacredXY;void main(){gl_FragColor=vec4(sacredFlameColor(sacredXY),1.);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`});
}
