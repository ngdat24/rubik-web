import {Vector2} from 'three';
import type {MeshPhysicalMaterial,Texture} from 'three';

/** Share the outer face's clear quartz window, excluding its bronze decoration. */
export function matchInnerGem(material:MeshPhysicalMaterial,atlas:Texture,face:number,motion:{time:{value:number};heat:{value:number}}){
  material.color.setHex(0xffffff);
  material.onBeforeCompile=shader=>{
    shader.uniforms.innerGemAtlas={value:atlas};
    shader.uniforms.innerGemFace={value:new Vector2(face%3/3,face<3?.5:0)};
    shader.uniforms.gemTime=motion.time;shader.uniforms.gemHeat=motion.heat;
    shader.vertexShader='attribute vec3 innerGemSource;varying vec3 innerGemPoint;\n'+shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
      innerGemPoint=innerGemSource;`);
    shader.fragmentShader=`uniform sampler2D innerGemAtlas;uniform vec2 innerGemFace;
      uniform float gemTime;uniform float gemHeat;varying vec3 innerGemPoint;
      float gemHash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
      float gemNoise(vec3 p){
        vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
        return mix(mix(mix(gemHash(i),gemHash(i+vec3(1,0,0)),f.x),mix(gemHash(i+vec3(0,1,0)),gemHash(i+vec3(1,1,0)),f.x),f.y),
          mix(mix(gemHash(i+vec3(0,0,1)),gemHash(i+vec3(1,0,1)),f.x),mix(gemHash(i+vec3(0,1,1)),gemHash(i+vec3(1,1,1)),f.x),f.y),f.z);
      }
      float gemField(vec3 p){return gemNoise(p)*.58+gemNoise(p*2.03)*.28+gemNoise(p*4.07)*.14;}
    \n`+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
      vec2 grain=vec2(sin(innerGemPoint.x*1.7+innerGemPoint.z*.9),sin(innerGemPoint.y*1.4-innerGemPoint.z*.7));
      vec2 quartz=innerGemFace+(vec2(1.50,2.30)+grain*vec2(.24,.12))*vec2(1./9.,1./6.);
      vec3 gemBase=texture2D(innerGemAtlas,quartz).rgb;
      // Fixed mineral inclusions stay attached to each piece; only the fire flows.
      float mineral=gemField(innerGemPoint*9.);
      diffuseColor.rgb*=gemBase*mix(.80,1.04,smoothstep(.20,.80,mineral));
    `);
    shader.fragmentShader=shader.fragmentShader.replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>
      vec3 gp=innerGemPoint;
      vec3 flow=gp*3.8+vec3(0.,-gemTime*.30,gemTime*.08);
      float warp=gemField(flow);
      float flame=pow(max(0.,1.-abs(sin(gp.y*7.+gp.x*3.+warp*9.-gemTime*1.5))),12.);
      float deepFlame=pow(max(0.,1.-abs(sin(gp.z*8.-gp.y*4.+gemField(flow+4.)*8.-gemTime*.95))),18.);
      float facing=clamp(abs(dot(normal,normalize(vViewPosition))),0.,1.);
      float rim=pow(1.-facing,3.);
      vec3 fireColor=mix(gemBase,vec3(1.),.26);
      totalEmissiveRadiance+=fireColor*(flame*.32+deepFlame*.16)*(1.+gemHeat*.35);
      // Colored dispersion is confined to glancing reflections, preserving face recognition.
      vec3 spectrum=.5+.5*cos(vec3(0.,2.094,4.189)+facing*18.+mineral*2.);
      totalEmissiveRadiance+=spectrum*rim*.17;
      vec3 cell=floor(gp*42.);
      float seed=gemHash(cell);
      float grainPeak=pow(max(0.,sin(dot(normalize(vViewPosition),normalize(vec3(seed-.5,fract(seed*7.)-.5,fract(seed*13.)-.5)))*65.+seed*37.)),32.);
      float fleck=pow(max(0.,1.-length(fract(gp*42.)-.5)*2.5),3.);
      totalEmissiveRadiance+=mix(vec3(1.),spectrum,.40)*grainPeak*fleck*step(.83,seed)*2.8;
      diffuseColor.a*=mix(1.,.88,rim);
    `);
  };
  material.customProgramCacheKey=()=> 'prometheus-inner-living-gem-v2';material.needsUpdate=true;
}
