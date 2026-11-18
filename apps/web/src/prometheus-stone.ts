/** Stable per-sticker seeds: the pattern travels with its material through turns. */
export const stoneSeeds=Array.from({length:54},(_,index)=>({
  x:(index+1)*1.61803398875,y:(index+1)*2.41421356237,angle:(index+1)*2.39996322973
}));
// Decoration-free gemstone windows: top, bottom, left and right edge caps.
export const stoneWindows=[[1.50,2.30,.48,.30],[1.50,.70,.48,.30],[.70,1.50,.30,.48],[2.30,1.50,.30,.48]] as const;

export const stoneGlsl=`
  uniform vec3 stoneSeed;
  uniform float stoneTime;
  uniform vec4 stoneWindow;
  float stoneHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
  float stoneNoise(vec2 p){
    vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
    return mix(mix(stoneHash(i),stoneHash(i+vec2(1,0)),f.x),mix(stoneHash(i+vec2(0,1)),stoneHash(i+vec2(1,1)),f.x),f.y);
  }
  float stoneCloud(vec2 p){return stoneNoise(p)*.58+stoneNoise(p*2.03)*.28+stoneNoise(p*4.07)*.14;}
  vec2 stoneSite(vec2 p){return vec2(stoneHash(p),stoneHash(p+vec2(39.7,17.3)));}
  float stoneBoundary(vec2 p){
    vec2 cell=floor(p),f=fract(p);float first=9.,second=9.;
    for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){
      vec2 neighbor=vec2(float(x),float(y));
      vec2 d=neighbor+stoneSite(cell+neighbor)-f;float distance=dot(d,d);
      if(distance<first){second=first;first=distance;}else second=min(second,distance);
    }
    return second-first;
  }
  vec2 stoneCoordinates(vec2 uv){
    float c=cos(stoneSeed.z),s=sin(stoneSeed.z);
    vec2 p=mat2(c,-s,s,c)*(uv-.5)*2.35+stoneSeed.xy;
    // Fixed mineral warping, never animated UVs or moving crack boundaries.
    p+=vec2(stoneCloud(p*2.1),stoneCloud(p*2.3+7.))*.32;
    return p;
  }
  float stoneVein(vec2 p){return 1.-smoothstep(.012,.045,stoneBoundary(p));}
  vec2 stoneTextureUv(vec2 uv){
    float c=cos(stoneSeed.z),s=sin(stoneSeed.z);
    vec2 p=mat2(c,-s,s,c)*(uv-.5)*(.78+.10*stoneHash(stoneSeed.xy));
    p+=(stoneSite(stoneSeed.xy)-.5)*.12;
    p+=vec2(stoneNoise(p*3.+stoneSeed.xy),stoneNoise(p*3.-stoneSeed.xy))*.025;
    return stoneWindow.xy+p*stoneWindow.zw;
  }
`;
