import {CubeController} from '@rubik/controller';
import {compileMove,parseMove,scrambleAt} from '@rubik/engine';
import type {Move} from '@rubik/engine';
import {buildLayout,dragTurn,layerSlots,rotationFor} from '@rubik/renderer';
import {ACESFilmicToneMapping,AdditiveBlending,AmbientLight,CanvasTexture,CircleGeometry,Color,CylinderGeometry,DirectionalLight,ExtrudeGeometry,Group,LinearFilter,LinearMipmapLinearFilter,Mesh,MeshPhysicalMaterial,NoColorSpace,Path,PerspectiveCamera,Plane,PMREMGenerator,PointLight,Raycaster,Scene,ShaderMaterial,Shape,SphereGeometry,Sprite,SpriteMaterial,SRGBColorSpace,TextureLoader,TorusGeometry,Vector2,Vector3,WebGLRenderer} from 'three';
import type {BufferGeometry,Object3D,Texture,WebGLRenderTarget} from 'three';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {attachKeyboard} from './keyboard.js';
import {bronzeRelief,sacredFlame} from './prometheus-ornaments.js';
import {capShape,capElevation,domedCap} from './prometheus-cap.js';
import {prometheus as design} from './prometheus-config.js';
import {prometheusFx} from './prometheus-fx.js';
import {prometheusAudio} from './prometheus-audio.js';
import {bakePrometheusAssets} from './prometheus-assets.js';
import {prometheusParallax} from './prometheus-parallax.js';
import {flameColorGlsl,paletteUniforms} from './prometheus-palette.js';
import {referenceMedallion,referenceSurface} from './prometheus-reference-surface.js';
import {facePyramidWedge} from './prometheus-pyramid.js';
import {matchInnerGem} from './prometheus-inner-gem.js';
import {bloomAmount,bloomTiming} from './prometheus-bloom.js';
import {SolvedUnification} from './prometheus-unification.js';
import {centerRing,centerGoldMaterial} from './prometheus-center-ring.js';
import {solvingGemRim} from './prometheus-solving-atlas.js';
import {solarHeart} from './prometheus-solar-heart.js';
import {WebGLRenderTarget as CardRenderTarget} from 'three';
import './prometheus-gameplay.css';
import './prometheus-preview.css';

const el=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
const stage=el('stage'),status=el('status');
stage.classList.add('prometheus-gameplay');
const previewName=document.createElement('div');previewName.className='prometheus-personal-name';previewName.textContent=design.names.vi;stage.append(previewName);
const layout=buildLayout(3,{gapRatio:.012,stickerInsetRatio:0});
type Quality='ultra'|'balanced'|'lite';
const materials=design.colors.map(color=>new MeshPhysicalMaterial({color,roughness:design.fixedAppearance.roughness,metalness:.025,
  clearcoat:1,clearcoatRoughness:.065,ior:1.52,envMapIntensity:.5}));
/** Local study display: consumes controller snapshots; never owns or mutates a Cube. */
class PrometheusStudy {
  private scene=new Scene();
  private camera=new PerspectiveCamera(34,1,.1,80);
  private webgl=new WebGLRenderer({antialias:true,alpha:true});
  private controls:OrbitControls;
  private caps:Mesh[]=[];
  private bodies:Group[]=[];
  private root=new Group();
  private pivot=new Group();
  private fx=prometheusFx(this.scene);
  private audio=prometheusAudio();
  private lastTurn=-Infinity;
  private quality:Quality='ultra';
  private coreDecor:Mesh[]=[];
  private heart:Mesh|undefined;
  private glowTexture:CanvasTexture;
  private glowSprite:Sprite;
  private lastStats=0;
  private atlases:MeshPhysicalMaterial[]=[];
  private liteAtlases:MeshPhysicalMaterial[]=[];
  private maps:Texture[]=[];
  private disposed=false;
  private referenceMaterials:MeshPhysicalMaterial[]=[];
  private solvingRims:MeshPhysicalMaterial[]=[];
  private medallionMaterials:MeshPhysicalMaterial[]=[];
  private pom={value:0};
  private depth={value:.018};
  private heightReady=false;
  private turnTimes:number[]=[];
  private coreLight=new PointLight(0xff4d2a,1.8,2.4,2);
  private queue:{move:Move;stateAfter:Uint8Array}[]=[];
  private active:{move:Move;stateAfter:Uint8Array;start:number;axis:Vector3;angle:number}|undefined;
  private geometry:BufferGeometry[]=[];
  private gemMotion={time:{value:0},heat:{value:0}};
  private pyramidMaterials=design.colors.map(color=>new MeshPhysicalMaterial({
    color,roughness:.035,metalness:0,clearcoat:1,clearcoatRoughness:.018,
    transparent:true,opacity:.98,depthWrite:true,thickness:.65,ior:1.76,
    iridescence:.35,iridescenceIOR:1.6,iridescenceThicknessRange:[120,420],
    specularIntensity:1,envMapIntensity:1.35,flatShading:true
  }));
  private bronze=new MeshPhysicalMaterial({...design.bronze,roughness:design.fixedAppearance.roughness,clearcoat:.25,envMapIntensity:1.15});
  private readonly centerAppearance={value:1};
  private ringEngraving=new MeshPhysicalMaterial({color:0x5c3a12,metalness:.65,roughness:.32});
  private channels=new MeshPhysicalMaterial({color:0xc8963e,metalness:.75,roughness:.17,emissive:0xffb703,emissiveIntensity:.65});
  private antiBleed=new MeshPhysicalMaterial({color:0x120406,roughness:.16,metalness:.25,opacity:.96,transparent:true});
  private centerGlass=design.colors.map(color=>new MeshPhysicalMaterial({color:new Color(color).multiplyScalar(.12),roughness:design.fixedAppearance.roughness,metalness:.1,clearcoat:1}));
  private centerFire=design.colors.map(color=>new MeshPhysicalMaterial({color,emissive:color,emissiveIntensity:.85,roughness:design.fixedAppearance.roughness,metalness:.05,clearcoat:1}));
  private spindle=new SphereGeometry(.32,20,16);
  private axle=new CylinderGeometry(.095,.095,2.3,16);
  private cage=new TorusGeometry(1.02,.025,6,64);
  private pod=new CylinderGeometry(.072,.085,.040,24);
  private lens=new SphereGeometry(.056,16,10);
  private podMaterial=new MeshPhysicalMaterial({color:0x5c3a12,metalness:.65,roughness:.22});
  private magnetMaterial=new MeshPhysicalMaterial({color:0xffb703,emissive:0xffb703,emissiveIntensity:1.4,roughness:.2,metalness:.5});
  private flameGeometry=new SphereGeometry(.22,16,14);
  private fire=new ShaderMaterial({
    uniforms:{time:{value:0},heat:{value:.65}},transparent:true,depthWrite:false,
    vertexShader:`uniform float time; varying vec3 flamePoint; void main(){
      flamePoint=position; vec3 p=position;float h=(p.y+.22)/.44;
      p.xz*=1.-h*.58;p.y*=1.75;
      p.x+=sin(h*6.+time*3.2)*h*h*.065;
      p.z+=cos(h*7.-time*2.8)*h*h*.035;
      gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}`,
    fragmentShader:`uniform float time;uniform float heat;varying vec3 flamePoint;
      void main(){float h=(flamePoint.y+.22)/.44;
      float wave=sin(flamePoint.y*42.-time*5.+sin(flamePoint.x*26.+time*2.))*0.5+0.5;
      float heart=clamp(1.-length(flamePoint.xz)*5.5-h*.35,0.,1.);
      vec3 color=mix(vec3(1.,.055,.008),vec3(1.,.52,.025),heart);
      color=mix(color,vec3(1.,.91,.50),pow(heart,3.)*.7);
      gl_FragColor=vec4(color*(.85+heat*.4),(.45+wave*.35)*(1.-h*.55));}`
  });
  private environment:WebGLRenderTarget;
  private manualOpen=false;
  private bloomPending=false;
  private bloom:{start:number;items:{object:Object3D;origin:Vector3;direction:Vector3}[];zoom:number;zoomEnabled:boolean}|undefined;
  private reducedMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
  private unification=new SolvedUnification(this.reducedMotion);
  private centerGold=centerGoldMaterial(this.bronze,this.unification.wave);
  private solar=solarHeart();
  onBloomChange:((active:boolean)=>void)=()=>{};
  private frame=0;
  private observer:ResizeObserver;
  constructor(){
    this.centerFire.forEach((material,face)=>{
      material.color.setHex(0xffffff);material.emissive.setHex(0xffffff);
      material.onBeforeCompile=shader=>{
        Object.assign(shader.uniforms,paletteUniforms(design.faceFlames[face]!));
        shader.vertexShader='varying vec2 sacredXY;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nsacredXY=position.xy;');
        shader.fragmentShader=flameColorGlsl+'varying vec2 sacredXY;\n'+shader.fragmentShader
          .replace('#include <map_fragment>','#include <map_fragment>\ndiffuseColor.rgb*=sacredFlameColor(sacredXY);')
          .replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\ntotalEmissiveRadiance*=sacredFlameColor(sacredXY);');
      };
      material.customProgramCacheKey=()=> 'prometheus-face-flame-gradient-v1';
    });
    const canvas=document.createElement('canvas');canvas.width=canvas.height=64;
    const context=canvas.getContext('2d')!,gradient=context.createRadialGradient(32,32,2,32,32,31);
    gradient.addColorStop(0,'#fff3b0');gradient.addColorStop(.25,'#ffb703');gradient.addColorStop(.65,'#ff2a5588');gradient.addColorStop(1,'#ff2a5500');
    context.fillStyle=gradient;context.fillRect(0,0,64,64);
    this.glowTexture=new CanvasTexture(canvas);this.glowTexture.colorSpace=SRGBColorSpace;
    this.glowSprite=new Sprite(new SpriteMaterial({map:this.glowTexture,transparent:true,depthWrite:false,blending:AdditiveBlending,opacity:.55}));this.glowSprite.scale.setScalar(1.55);
    this.webgl.outputColorSpace=SRGBColorSpace;this.webgl.setPixelRatio(Math.min(devicePixelRatio,2));
    this.webgl.toneMapping=ACESFilmicToneMapping;this.webgl.toneMappingExposure=.8;
    const pmrem=new PMREMGenerator(this.webgl),room=new RoomEnvironment();
    this.environment=pmrem.fromScene(room,.04);this.scene.environment=this.environment.texture;this.scene.environmentIntensity=.45;
    room.dispose();pmrem.dispose();
    stage.append(this.webgl.domElement);this.webgl.domElement.setAttribute('aria-label','Rubik Prometheus 3D');
    this.camera.position.set(6,5,7);this.camera.zoom=1.12;this.camera.updateProjectionMatrix();this.controls=new OrbitControls(this.camera,this.webgl.domElement);
    this.controls.enableDamping=true;this.controls.enablePan=false;this.controls.minDistance=5;this.controls.maxDistance=15;
    this.scene.add(this.root,this.pivot,this.coreLight,new AmbientLight(0xffffff,.3));
    for(const [x,y,z,intensity] of [[4,7,5,1.6],[-5,2,-3,.8]]){
      const light=new DirectionalLight(0xffffff,intensity);light.position.set(x!,y!,z!);this.scene.add(light);
    }
    this.observer=new ResizeObserver(()=>this.resize());this.observer.observe(stage);this.resize();this.draw(0);void this.loadReference();
  }
  private async loadReference(){
    try{
      const atlas=await new TextureLoader().loadAsync('/assets/skins/s1_red_prometheus_flame/material_atlas.png');
      if(this.disposed){atlas.dispose();return;}
      atlas.colorSpace=SRGBColorSpace;atlas.anisotropy=Math.min(16,this.webgl.capabilities.getMaxAnisotropy());atlas.minFilter=LinearMipmapLinearFilter;atlas.magFilter=LinearFilter;this.maps.push(atlas);
      const solvingAtlas=await new TextureLoader().loadAsync('/assets/skins/s1_red_prometheus_flame/solving-gemstone-reference.png').catch(()=>undefined);
      if(this.disposed){solvingAtlas?.dispose();return;}
      if(solvingAtlas){solvingAtlas.colorSpace=SRGBColorSpace;solvingAtlas.anisotropy=Math.min(16,this.webgl.capabilities.getMaxAnisotropy());solvingAtlas.minFilter=LinearMipmapLinearFilter;solvingAtlas.magFilter=LinearFilter;this.maps.push(solvingAtlas);
        this.solvingRims=Array.from({length:54},(_,i)=>solvingGemRim(solvingAtlas,Math.floor(i/9),i%9,this.unification.amount));}
      this.pyramidMaterials.forEach((material,face)=>matchInnerGem(material,atlas,face,this.gemMotion));
      this.referenceMaterials=Array.from({length:54},(_,i)=>referenceSurface(atlas,Math.floor(i/9),i%9,this.unification,this.gemMotion.time,solvingAtlas));
      this.medallionMaterials=Array.from({length:6},(_,face)=>referenceMedallion(atlas,face,this.gemMotion.time,this.centerAppearance,this.unification.wave));this.setQuality('ultra');this.fx.prewarm(this.webgl,this.camera);
    }catch{await this.loadMaps();}
  }
  private async loadMaps(){
    const root='/assets/skins/s1_red_prometheus_flame/',loader=new TextureLoader(),cache=new Map<string,Promise<Texture|undefined>>();
    const load=(name:string,color=false)=>{
      if(!cache.has(name))cache.set(name,loader.loadAsync(root+name).then(texture=>{
        texture.colorSpace=color?SRGBColorSpace:NoColorSpace;texture.anisotropy=Math.min(16,this.webgl.capabilities.getMaxAnisotropy());
        texture.minFilter=LinearMipmapLinearFilter;texture.magFilter=LinearFilter;texture.generateMipmaps=true;this.maps.push(texture);return texture;
      }).catch(()=>undefined));
      return cache.get(name)!;
    };
    const [normal,ao,rough,height,emissive]=await Promise.all(['normal_1024.png','ao_1024.png','roughness_1024.png','height_1024.png','emissive_mask_1024.png'].map(name=>load(name)));
    this.heightReady=Boolean(height);
    for(const [face,name] of ['u','r','f','d','l','b'].entries()){
      const [map,liteMap]=await Promise.all([load('albedo_'+name+'_1024.png',true),load('albedo_'+name+'.png',true)]);
      for(let tile=0;tile<9;tile++){
        const make=(lite:boolean)=>{
          const material=new MeshPhysicalMaterial({map:(lite?liteMap:map)??null,color:0xffffff,normalMap:lite?null:normal??null,normalScale:new Vector2(.95,.95),aoMap:lite?null:ao??null,aoMapIntensity:1.25,
            roughnessMap:lite?null:rough??null,roughness:lite ? .18 : 1,metalnessMap:lite?null:height??null,metalness:lite ? .12 : .88,
            emissiveMap:emissive??null,emissive:0xffffff,emissiveIntensity:emissive ? .65 : 0,clearcoat:lite ? .2 : 1,clearcoatRoughness:.07,ior:1.52,envMapIntensity:.8});
          material.onBeforeCompile=shader=>{
            shader.uniforms.studyTile={value:new Vector2(tile%3,2-Math.floor(tile/3))};
            shader.uniforms.studyFaceColor={value:new Color(design.colors[face]!)};
            Object.assign(shader.uniforms,paletteUniforms(design.faceFlames[face]!));
            shader.vertexShader='uniform vec2 studyTile;\n'+shader.vertexShader.replace('#include <uv_vertex>',`#include <uv_vertex>
              vec2 studyAtlas=(uv+studyTile)/3.;
              #ifdef USE_MAP
              vMapUv=studyAtlas;
              #endif
              #ifdef USE_NORMALMAP
              vNormalMapUv=studyAtlas;
              #endif
              #ifdef USE_AOMAP
              vAoMapUv=studyAtlas;
              #endif
              #ifdef USE_ROUGHNESSMAP
              vRoughnessMapUv=studyAtlas;
              #endif
              #ifdef USE_METALNESSMAP
              vMetalnessMapUv=studyAtlas;
              #endif
              #ifdef USE_EMISSIVEMAP
              vEmissiveMapUv=studyAtlas;
              #endif`);
            shader.fragmentShader=flameColorGlsl+'uniform vec3 studyFaceColor;\n'+shader.fragmentShader;
            shader.fragmentShader=shader.fragmentShader.replace('#include <emissivemap_fragment>',`#ifdef USE_EMISSIVEMAP
              float studyMask=texture2D(emissiveMap,vEmissiveMapUv).r;
              vec2 sacredXY=fract(vMapUv*3.)-.5;
              float centerStar=step(length(studyTile-vec2(1.)),.1)*(1.-step(.32,length(sacredXY)));
              vec3 emitColor=mix(vec3(1.,.718,.012)*.35,sacredFlameColor(sacredXY),centerStar);
              totalEmissiveRadiance*=studyMask*emitColor;
              #endif`);
            if(!lite)prometheusParallax(shader,height??null,this.pom,this.depth);
          };
          material.customProgramCacheKey=()=>lite?'prometheus-lite-face-flame-v4':'prometheus-pbr-face-flame-v4';
          return material;
        };
        // Missing albedo keeps the geometry fallback rather than displaying an empty tile.
        if(map)this.atlases[face*9+tile]=make(false);
        if(liteMap)this.liteAtlases[face*9+tile]=make(true);
      }
    }
    if(this.disposed){this.maps.forEach(t=>t.dispose());this.referenceMaterials.forEach(m=>m.dispose());this.medallionMaterials.forEach(m=>m.dispose());this.atlases.forEach(m=>m.dispose());this.liteAtlases.forEach(m=>m.dispose());return;}
    this.setQuality(this.quality);
  }
  private resize(){this.camera.aspect=stage.clientWidth/stage.clientHeight;this.camera.updateProjectionMatrix();this.webgl.setSize(stage.clientWidth,stage.clientHeight,false);}
  get isAnimating(){return Boolean(this.manualOpen||this.active||this.queue.length||this.bloom||this.bloomPending);}
  setSize(size:number){if(size!==3)throw Error('Demo này chỉ dùng 3×3.');}
  private cancel(){
    this.cancelBloom();
    while(this.pivot.children.length)this.root.attach(this.pivot.children[0]!);
    this.pivot.rotation.set(0,0,0);this.pivot.position.set(0,0,0);this.active=undefined;this.queue=[];this.manualOpen=false;this.fx.clear();
  }
  setState(state:Uint8Array){
    this.cancel();this.root.clear();this.coreDecor=[];this.geometry.forEach(g=>g.dispose());this.geometry=[];
    const round=design.fixedAppearance.edgeRound;
    this.caps=layout.slots.map((slot,index)=>{
      const geometry=domedCap(index%9,round);
      this.geometry.push(geometry);
      const mesh=new Mesh(geometry,materials[state[index]!]!);
      mesh.userData.face=state[index];mesh.userData.tile=index%9;
      const ornament=bronzeRelief(index%9,capShape(index%9,round));this.geometry.push(ornament);
      const bend=(g:BufferGeometry)=>{const p=g.getAttribute('position');for(let i=0;i<p.count;i++)p.setZ(i,p.getZ(i)+capElevation(p.getX(i),p.getY(i),index%9,round));g.computeVertexNormals();};
      bend(ornament);
      const relief=new Mesh(ornament,this.bronze);relief.position.z=.065;mesh.add(relief);
      if(index%9===4){
        const disk=new CircleGeometry(.325,64);bend(disk);this.geometry.push(disk);
        const glass=new Mesh(disk,this.centerGlass[state[index]!]!);glass.position.z=.064;mesh.add(glass);
        const star=new ExtrudeGeometry(sacredFlame(.275),{depth:.006,bevelSize:.002,bevelThickness:.002,bevelSegments:2});bend(star);this.geometry.push(star);
        const flame=new Mesh(star,this.centerFire[state[index]!]!);flame.position.z=.070;mesh.add(flame);
      }
      const outline=capShape(index%9,round),channelShape=new Shape(outline.getPoints(16).map(p=>p.multiplyScalar(1.015)));
      channelShape.holes.push(new Path(outline.getPoints(16).map(p=>p.multiplyScalar(.94)).reverse()));
      const channelGeo=new ExtrudeGeometry(channelShape,{depth:.02,bevelSize:.003,bevelThickness:.003,bevelSegments:2});this.geometry.push(channelGeo);
      channelGeo.setAttribute('innerGemSource',channelGeo.getAttribute('position').clone());
      const channel=new Mesh(channelGeo,this.pyramidMaterials[state[index]!]!);channel.position.z=-.022;channel.userData.kind='channel';channel.userData.gemFace=state[index];mesh.add(channel);
      const rimShape=new Shape(outline.getPoints(16).map(p=>p.multiplyScalar(1.008)));
      rimShape.holes.push(new Path(outline.getPoints(16).map(p=>p.multiplyScalar(.97)).reverse()));
      const rimGeo=new ExtrudeGeometry(rimShape,{depth:.018,bevelEnabled:false});this.geometry.push(rimGeo);
      const rim=new Mesh(rimGeo,this.antiBleed);rim.position.z=.005;rim.userData.kind='gem-rim';mesh.add(rim);
      mesh.position.set(...slot.position);mesh.quaternion.setFromUnitVectors(new Vector3(0,0,1),new Vector3(...slot.normal));
      this.root.add(mesh);return mesh;
    });
    this.bodies=layout.cubies.map(slot=>{
      const mesh=new Group();mesh.position.set(...slot.position);
      for(const face of layout.slots.filter(face=>face.position.every((value,axis)=>Math.abs(value-face.normal[axis]!*.5-slot.position[axis]!)<1e-7))){
        const geometry=facePyramidWedge(face.position,face.normal,slot.position,capShape(face.index%9,round).getPoints(16));this.geometry.push(geometry);
        const pyramid=new Mesh(geometry,this.pyramidMaterials[face.face]!);pyramid.userData.kind='pyramid';pyramid.userData.face=face.face;mesh.add(pyramid);
      }
      if(slot.coordinates.filter(v=>v!==0).length===2){
        const axis=slot.coordinates.findIndex(v=>v===0),normal=new Vector3().setComponent(axis,1);
        for(const direction of [-1,1]){
          const pod=new Mesh(this.pod,this.podMaterial);
          pod.userData.kind='magnet';
          // Two thirds from the cubie's inner midpoint toward the outer two-color corner.
          pod.position.set(...slot.coordinates).multiplyScalar(.49*(2/3)/2).setComponent(axis,direction*.437);
          pod.quaternion.setFromUnitVectors(new Vector3(0,1,0),normal.clone().multiplyScalar(direction));
          const lens=new Mesh(this.lens,this.magnetMaterial);lens.position.y=.025;lens.scale.y=.3;pod.add(lens);mesh.add(pod);
        }
      }
      this.root.add(mesh);return mesh;
    });
    this.root.add(this.solar.root);this.setQuality(this.quality);
  }
  enqueueMove(move:Move,stateAfter:Uint8Array){parseMove(move,3);this.queue.push({move,stateAfter:stateAfter.slice()});}
  enqueueMoves(moves:readonly {move:Move;stateAfter:Uint8Array}[]){for(const item of moves)this.enqueueMove(item.move,item.stateAfter);}
  view(which:string){
    if(which==='white'){this.camera.position.set(0,9,.001);this.camera.up.set(0,0,-1);}
    else{this.camera.up.set(0,1,0);if(which==='back')this.camera.position.set(-6,-5,-7);else this.camera.position.set(6,5,7);}
    this.controls.target.set(0,0,0);this.camera.lookAt(0,0,0);this.controls.update();
  }
  soundEnabled(value:boolean){this.audio.setEnabled(value);}
  cardPreview(){
    const size=640,target=new CardRenderTarget(size,size),previous=this.webgl.getRenderTarget();target.texture.colorSpace=SRGBColorSpace;
    const camera=this.camera.clone();camera.aspect=1;camera.zoom=1.2;camera.position.set(-6,5,-7);camera.up.set(0,1,0);camera.lookAt(0,0,0);camera.updateProjectionMatrix();
    const pixels=new Uint8Array(size*size*4);
    try{this.webgl.setRenderTarget(target);this.webgl.render(this.scene,camera);this.webgl.readRenderTargetPixels(target,0,0,size,size,pixels);}
    finally{this.webgl.setRenderTarget(previous);target.dispose();}
    const canvas=document.createElement('canvas');canvas.width=canvas.height=size;const ctx=canvas.getContext('2d')!,data=ctx.createImageData(size,size);
    for(let y=0;y<size;y++)data.data.set(pixels.subarray((size-1-y)*size*4,(size-y)*size*4),y*size*4);
    ctx.putImageData(data,0,0);return canvas.toDataURL('image/png');
  }
  bakeAssets(){
    const images=bakePrometheusAssets(capShape,design.fixedAppearance.edgeRound);
    const renderer=new WebGLRenderer({antialias:true,alpha:true,preserveDrawingBuffer:true});renderer.setSize(256,256,false);
    renderer.outputColorSpace=SRGBColorSpace;renderer.toneMapping=this.webgl.toneMapping;renderer.toneMappingExposure=this.webgl.toneMappingExposure;
    const camera=this.camera.clone();camera.aspect=1;camera.updateProjectionMatrix();renderer.render(this.scene,camera);
    images['preview.png']=renderer.domElement.toDataURL('image/png');renderer.dispose();renderer.forceContextLoss();return images;
  }
  setQuality(value:Quality){
    this.quality=value;
    this.pom.value=value==='ultra'&&this.heightReady?1:0;
    this.coreLight.visible=value==='ultra';this.heart&&(this.heart.visible=value==='ultra');
    this.glowSprite.visible=value!=='ultra';this.glowSprite.material.opacity=value==='lite'?.2:.55;
    this.coreDecor.forEach(mesh=>{mesh.visible=value!=='lite';});
    for(const body of this.bodies)for(const part of body.children)part.visible=value==='ultra';
    for(const cap of this.caps){
      const key=Number(cap.userData.face)*9+Number(cap.userData.tile),atlas=this.referenceMaterials[key]??(value==='lite'?this.liteAtlases:this.atlases)[key];
      cap.material=atlas??materials[Number(cap.userData.face)]!;
      for(const child of cap.children)if(child.userData.kind==='gem-rim')(child as Mesh).material=this.solvingRims[key]??this.antiBleed;
      if(Number(cap.userData.tile)===4&&this.medallionMaterials.length&&!cap.children.some(child=>child.userData.kind==='medallion')){
        const geometry=new CircleGeometry(.418,96),p=geometry.getAttribute('position');
        for(let i=0;i<p.count;i++)p.setZ(i,capElevation(p.getX(i),p.getY(i),4,design.fixedAppearance.edgeRound));
        geometry.computeVertexNormals();this.geometry.push(geometry);
        const medallion=new Mesh(geometry,this.medallionMaterials[Number(cap.userData.face)]!);
        medallion.position.set(0,0,.082);medallion.userData.kind='medallion';cap.add(medallion);
        cap.add(centerRing(this.centerGold,this.ringEngraving,this.geometry));
      }
      cap.children.forEach(child=>{child.visible=child.userData.kind==='medallion'||child.userData.kind==='medallion-ring'||child.userData.kind==='channel'||child.userData.kind==='gem-rim'||!atlas||(!this.referenceMaterials.length&&value==='ultra');});
    }
    this.fx.setEnabled(value!=='lite');
    this.webgl.setPixelRatio(Math.min(devicePixelRatio,value==='ultra'?2:value==='balanced'?1.5:1));
    this.resize();el('quality-note').textContent=(value==='ultra'?'Ultra · Parallax 12 bước, lõi plasma 3D, 24 nam châm, đèn động':value==='balanced'?'Balanced · PBR, lõi sprite, giữ vệt xoay 3D':'Lite · Phát sáng tĩnh, tắt đèn động và hiệu ứng hạt');
  }
  feedback(move:string){this.audio.turn(move);this.lastTurn=performance.now();this.turnTimes.push(this.lastTurn);}
  setSolvedAppearance(solved:boolean,immediate=false){this.unification.setSolved(solved,performance.now(),immediate);}
  celebrate(){
    if(this.manualOpen||this.bloom||this.bloomPending||this.disposed)return false;
    this.bloomPending=true;this.onBloomChange(true);return true;
  }
  private beginBloom(now:number){
    const items:{object:Object3D;origin:Vector3;direction:Vector3}[]=[];
    this.caps.forEach((object,index)=>{
      const slot=layout.slots[index]!;
      const direction=new Vector3(...slot.position).addScaledVector(new Vector3(...slot.normal),-.5).normalize();
      items.push({object,origin:object.position.clone(),direction});
    });
    this.bodies.forEach(object=>items.push({object,origin:object.position.clone(),direction:object.position.clone().normalize()}));
    this.bloom={start:now,items,zoom:this.camera.zoom,zoomEnabled:this.controls.enableZoom};
    this.bloomPending=false;this.controls.enableZoom=false;
    this.unification.reveal(now);
    this.fx.clear();this.fx.solve(now);this.audio.solve();
  }
  private cancelBloom(){
    const active=Boolean(this.bloom||this.bloomPending);
    if(this.bloom){
      for(const item of this.bloom.items)item.object.position.copy(item.origin);
      this.camera.zoom=this.bloom.zoom;this.camera.updateProjectionMatrix();this.controls.enableZoom=this.bloom.zoomEnabled;
    }
    this.bloom=undefined;this.bloomPending=false;
    if(active)this.onBloomChange(false);
  }
  private animateBloom(now:number){
    if(!this.bloom)return;
    const elapsed=now-this.bloom.start,amount=this.reducedMotion?0:bloomAmount(elapsed);
    for(const item of this.bloom.items)item.object.position.copy(item.origin).addScaledVector(item.direction,amount*bloomTiming.distance);
    // Keep the camera framing fixed so opening does not shrink the visible cubies.
    if(elapsed>=(this.reducedMotion?900:bloomTiming.duration))this.cancelBloom();
  }
  revealSound(){this.audio.solve();}
  bindDrag(controller:CubeController){
    const canvas=this.webgl.domElement,ray=new Raycaster();
    let gesture:{id:number;index:number;plane:Plane;start:Vector3;dx:number;dy:number;x:number;y:number}|undefined;
    const point=(event:PointerEvent)=>{
      const rect=canvas.getBoundingClientRect();ray.setFromCamera(new Vector2((event.clientX-rect.left)/rect.width*2-1,1-(event.clientY-rect.top)/rect.height*2),this.camera);
    };
    const cancel=()=>{gesture=undefined;this.controls.enabled=true;controller.unlockInput('study-drag');};
    const down=(event:PointerEvent)=>{
      if(gesture&&gesture.id!==event.pointerId){cancel();return;}
      if(event.button!==0||!controller.inputEnabled||this.isAnimating)return;
      point(event);const hit=ray.intersectObjects(this.caps,true)[0];if(!hit)return;
      const index=this.caps.findIndex(cap=>cap===hit.object||cap===hit.object.parent);if(index<0)return;
      const normal=this.caps[index]!.getWorldDirection(new Vector3()),plane=new Plane().setFromNormalAndCoplanarPoint(normal,hit.point);
      gesture={id:event.pointerId,index,plane,start:hit.point.clone(),x:event.clientX,y:event.clientY,dx:0,dy:0};
      controller.lockInput('study-drag');this.controls.enabled=false;canvas.setPointerCapture(event.pointerId);event.stopImmediatePropagation();event.preventDefault();
    };
    const move=(event:PointerEvent)=>{if(gesture?.id===event.pointerId){gesture.dx=event.clientX-gesture.x;gesture.dy=event.clientY-gesture.y;event.stopImmediatePropagation();event.preventDefault();}};
    const up=(event:PointerEvent)=>{
      if(gesture?.id!==event.pointerId)return;
      const g=gesture;point(event);const end=ray.ray.intersectPlane(g.plane,new Vector3());
      const turn=end&&Math.hypot(event.clientX-g.x,event.clientY-g.y)>=8?dragTurn(3,g.index,end.sub(g.start).toArray()):undefined;
      cancel();if(canvas.hasPointerCapture(event.pointerId))canvas.releasePointerCapture(event.pointerId);
      if(turn)controller.applyMove(turn.move,event.timeStamp);
      event.stopImmediatePropagation();event.preventDefault();
    };
    const abort=(event:PointerEvent)=>{if(gesture?.id===event.pointerId)cancel();};
    canvas.addEventListener('pointerdown',down,true);canvas.addEventListener('pointermove',move,true);canvas.addEventListener('pointerup',up,true);canvas.addEventListener('pointercancel',abort,true);canvas.addEventListener('lostpointercapture',abort,true);window.addEventListener('blur',cancel);
    return ()=>{cancel();canvas.removeEventListener('pointerdown',down,true);canvas.removeEventListener('pointermove',move,true);canvas.removeEventListener('pointerup',up,true);canvas.removeEventListener('pointercancel',abort,true);canvas.removeEventListener('lostpointercapture',abort,true);window.removeEventListener('blur',cancel);};
  }
  openCore(){
    if(this.isAnimating)return false;
    const selected=layerSlots(parseMove('U',3),3);
    for(const i of selected.stickerIndices)this.pivot.attach(this.caps[i]!);
    for(const i of selected.cubieIndices)this.pivot.attach(this.bodies[i]!);
    this.pivot.rotation.y=Math.PI/4;this.pivot.position.y=.48;this.manualOpen=true;return true;
  }
  closeCore(){if(!this.manualOpen)return;this.pivot.rotation.set(0,0,0);this.pivot.position.set(0,0,0);this.cancel();}
  private draw=(now:number)=>{
    this.fire.uniforms.time!.value=now/1000;
    this.turnTimes=this.turnTimes.filter(t=>now-t<1000);
    const tps=this.turnTimes.length,heatScale=1+Math.min(.45,tps*.075),pulse=Math.sin(now/1000*Math.PI*2*.85)*.055;
    const ignition=this.fx.update(now);this.fire.uniforms.heat!.value=(design.fixedAppearance.glow*2+pulse)*heatScale+ignition;
    this.gemMotion.time.value=now/1000;this.gemMotion.heat.value=Math.min(2,ignition+tps*.10);
    if(this.heart)this.heart.scale.set(2.2*heatScale,1.45*heatScale,2.2*heatScale);
    this.coreLight.intensity=1.8+Math.max(0,1-(now-this.lastTurn)/180)*1.4+ignition;
    this.audio.update(this.camera,now);
    if(!this.bloom&&!this.active&&this.queue.length){
      const item=this.queue.shift()!,parsed=parseMove(item.move,3),rotation=rotationFor(parsed),selected=layerSlots(parsed,3);
      this.fx.turn(item.move,now,this.camera.position);
      for(const index of selected.stickerIndices)this.pivot.attach(this.caps[index]!);
      for(const index of selected.cubieIndices)this.pivot.attach(this.bodies[index]!);
      this.active={...item,start:now,axis:new Vector3(...rotation.axis),angle:rotation.angle};
    }
    if(this.active){
      const a=this.active,t=Math.min(1,(now-a.start)/(Math.abs(parseMove(a.move,3).quarterTurns)===2?240:170));
      this.pivot.setRotationFromAxisAngle(a.axis,a.angle*t*t*(3-2*t));
      if(t===1){
        while(this.pivot.children.length)this.root.attach(this.pivot.children[0]!);
        this.pivot.rotation.set(0,0,0);
        const perm=compileMove(a.move,3),next=[...this.caps];
        this.caps.forEach((mesh,index)=>{next[perm[index]!]=mesh;});this.caps=next;
        // Re-identify cubies by their engine-defined positions after the physical turn.
        this.bodies=layout.cubies.map(slot=>this.bodies.find(mesh=>mesh.position.distanceTo(new Vector3(...slot.position))<.01)!);
        this.active=undefined;
      }
    }
    if(this.bloomPending&&!this.active&&!this.queue.length)this.beginBloom(now);
    this.animateBloom(now);
    this.unification.update(now);
    const solarBurst=this.solar.update(now,this.bloom?now-this.bloom.start:undefined);
    this.coreLight.color.setHex(solarBurst>0?0xffb703:0xff4d2a);this.coreLight.intensity+=solarBurst*3.;
    this.controls.update();this.webgl.render(this.scene,this.camera);
    if(now-this.lastStats>500){el('performance').textContent=`${this.webgl.info.render.calls} draw calls · ${this.webgl.info.render.triangles.toLocaleString('vi')} tam giác`;this.lastStats=now;}
    this.frame=requestAnimationFrame(this.draw);
  };
  dispose(){this.solar.dispose();this.centerGold.dispose();this.solvingRims.forEach(material=>material.dispose());this.ringEngraving.dispose();this.cancelBloom();this.disposed=true;cancelAnimationFrame(this.frame);this.observer.disconnect();this.controls.dispose();this.fx.dispose();this.audio.dispose();this.geometry.forEach(g=>g.dispose());this.pyramidMaterials.forEach(m=>m.dispose());this.bronze.dispose();this.spindle.dispose();this.axle.dispose();this.cage.dispose();this.pod.dispose();this.lens.dispose();this.podMaterial.dispose();this.magnetMaterial.dispose();this.flameGeometry.dispose();this.fire.dispose();this.glowTexture.dispose();this.glowSprite.material.dispose();materials.forEach(m=>m.dispose());this.maps.forEach(t=>t.dispose());this.referenceMaterials.forEach(m=>m.dispose());this.medallionMaterials.forEach(m=>m.dispose());this.atlases.forEach(m=>m.dispose());this.liteAtlases.forEach(m=>m.dispose());this.environment.dispose();this.webgl.dispose();this.webgl.domElement.remove();}
}

const display=new PrometheusStudy(),controller=new CubeController(display,3);
display.onBloomChange=active=>{
  if(active)controller.lockInput('solve-bloom');else controller.unlockInput('solve-bloom');
  for(const button of document.querySelectorAll<HTMLButtonElement>('#core,#mix,#solve-fx,#moves button'))button.disabled=active;
  status.textContent=active?'Rubik đang xòe quanh tâm lõi rồi tự khép lại…':'Đã khép nguyên khối · sẵn sàng';
};
// Ultra only: no quality selector or automatic downgrade.
display.setQuality('ultra');
const offDrag=display.bindDrag(controller);
let wasSolved=true;
const offMove=controller.onMoveApplied(({move})=>{display.feedback(move);const solved=controller.isSolved();display.setSolvedAppearance(solved);if(solved&&!wasSolved)display.celebrate();wasSolved=solved;if(!controller.lockedBy.has('solve-bloom'))status.textContent='Đang xoay '+move;});
const offKeys=attachKeyboard(controller,move=>{if(!controller.lockedBy.has('solve-bloom'))status.textContent='Đang xoay '+move;});
for(const move of ['U','R','F','D','L','B']){
  const button=document.createElement('button');button.textContent=move;button.onclick=()=>controller.applyMove(move,performance.now());el('moves').append(button);
}
el('reset').onclick=()=>{controller.reset();status.textContent='Đã về nguyên khối';};
el('mix').onclick=()=>{if(display.isAnimating)return;controller.moves(scrambleAt(String(Date.now()),3,0),performance.now());status.textContent='Đang trộn thử';};
el('reverse').onclick=()=>display.view('back');el('front').onclick=()=>display.view('white');
let coreOpen=false;
const coreButton=el<HTMLButtonElement>('core');
const offReplace=controller.onStateReplaced(()=>{wasSolved=controller.isSolved();display.setSolvedAppearance(wasSolved,true);coreOpen=false;controller.unlockInput('core-study');coreButton.textContent='Mở lớp xem lõi';coreButton.setAttribute('aria-pressed','false');});
coreButton.onclick=()=>{
  if(coreOpen){display.closeCore();coreOpen=false;controller.unlockInput('core-study');}
  else if(display.openCore()){coreOpen=true;controller.lockInput('core-study');}
  coreButton.textContent=coreOpen?'Đóng lớp trên':'Mở lớp xem lõi';coreButton.setAttribute('aria-pressed',String(coreOpen));
  status.textContent=coreOpen?'Tách lớp để xem ruột đá quý, lồng đồng và tim lửa · đóng lớp để tiếp tục xoay':'Sẵn sàng';
};
el('loading').remove();
if(import.meta.env.DEV)Object.defineProperty(window,'prometheusStudy',{value:{controller,display},configurable:true});
el('solve-fx').onclick=()=>{if(coreOpen)coreButton.click();display.celebrate();};
const reveal=el<HTMLDialogElement>('reveal');
el('reveal-open').onclick=()=>{reveal.showModal();reveal.classList.remove('ignite');void reveal.offsetWidth;reveal.classList.add('ignite');display.revealSound();};
el('reveal-close').onclick=()=>reveal.close();
let soundOn=true;el('sound').onclick=()=>{soundOn=!soundOn;display.soundEnabled(soundOn);el('sound').textContent='Âm thanh: '+(soundOn?'Bật':'Tắt');el('sound').setAttribute('aria-pressed',String(soundOn));};
const dispose=()=>{offKeys();offDrag();offMove();offReplace();controller.dispose();};
window.addEventListener('pagehide',event=>{if(!event.persisted)dispose();});
if(import.meta.hot)import.meta.hot.dispose(dispose);
