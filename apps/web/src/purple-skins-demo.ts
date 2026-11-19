import {ACESFilmicToneMapping,AmbientLight,CanvasTexture,DirectionalLight,Group,Mesh,MeshPhysicalMaterial,MeshStandardMaterial,PerspectiveCamera,PMREMGenerator,PointLight,Scene,SRGBColorSpace,Vector3,WebGLRenderer} from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';

import {referenceTile} from './purple-reference.js';
type Skin={skin_id:string;name:string;season_id:string;body:{color:string;roughness:number;metalness:number};layers:{layer_1_base:{face_colors:Record<string,string>};layer_2_surface:{roughness:number;metalness:number;transmission?:number;ior?:number;thickness?:number;anisotropy?:number;anisotropy_rotation_deg?:number;specular_intensity?:number;normal_scale:number}}};
const skins:Skin[]=await fetch('/assets/purple-skin-demo.json').then(r=>r.json());
const disposers:(()=>void)[]=[];
for(const [kind,skin]of skins.entries()){
 const card=document.createElement('article'),heading=document.createElement('h2'),caption=document.createElement('small'),stage=document.createElement('div');heading.textContent=skin.name;caption.textContent=skin.season_id==='standard'?'Tiêu chuẩn · '+(kind<2?'Kim loại':'Kính và nhựa bán trong'):'Mùa 1';stage.className='stage';card.append(heading,caption,stage);document.querySelector('#skins')!.append(card);
 const renderer=new WebGLRenderer({alpha:true,antialias:true});renderer.setPixelRatio(Math.min(Math.max(devicePixelRatio,2),3));renderer.toneMapping=ACESFilmicToneMapping;renderer.toneMappingExposure=.85;stage.append(renderer.domElement);
 const scene=new Scene(),camera=new PerspectiveCamera(38,1,.1,100);camera.position.set(4.6,3.8,5.4);const controls=new OrbitControls(camera,renderer.domElement);controls.enablePan=false;controls.minDistance=5;controls.maxDistance=16;controls.target.set(0,0,0);
 const room=new RoomEnvironment(),pmrem=new PMREMGenerator(renderer),environment=pmrem.fromScene(room,.04);scene.environment=environment.texture;room.dispose();pmrem.dispose();scene.add(new AmbientLight(0xffffff,.75));const key=new DirectionalLight(0xfff4df,2.9);key.position.set(4,6,5);scene.add(key);
 if(kind===3){const inner=new PointLight(0xffdfb2,2.2,6);inner.position.set(0,0,0);scene.add(inner);}
 const root=new Group();scene.add(root);const geometry=new RoundedBoxGeometry(.98,.98,.98,3,.055),cap=new RoundedBoxGeometry(kind>=7?.995:.92,kind>=7?.995:.92,kind>=7?.09:.065,3,kind>=7?.045:.065),bodyMaterial=new MeshStandardMaterial({...skin.body,color:kind===2?'#a9bdcf':kind===3?'#352d2b':kind===4?'#20130d':skin.body.color,transparent:kind===3,opacity:kind===3?.86:1}),materials:MeshPhysicalMaterial[]=[],textures:CanvasTexture[]=[];
 const surface=skin.layers.layer_2_surface,faces=['U','R','F','D','L','B'],normals=[[0,1,0],[1,0,0],[0,0,1],[0,-1,0],[-1,0,0],[0,0,-1]];
 for(let x=-1;x<=1;x++)for(let y=-1;y<=1;y++)for(let z=-1;z<=1;z++){if(!x&&!y&&!z)continue;const body=new Mesh(geometry,bodyMaterial);body.position.set(x,y,z);root.add(body);}
 for(let face=0;face<6;face++)for(let tile=0;tile<9;tile++){
  const reference=referenceTile(kind,face,tile);const map=reference.map,bump=reference.bump;textures.push(map,bump);
  const material=new MeshPhysicalMaterial({color:reference?'#ffffff':skin.layers.layer_1_base.face_colors[faces[face]!]!,map,bumpMap:bump,bumpScale:surface.normal_scale*.045,roughness:surface.roughness,metalness:Math.min(surface.metalness,.55),transmission:Math.min(surface.transmission??0,.18),ior:surface.ior??1.5,thickness:surface.thickness??.3,anisotropy:surface.anisotropy??0,anisotropyRotation:(surface.anisotropy_rotation_deg??0)*Math.PI/180,specularIntensity:surface.specular_intensity??.5,clearcoat:surface.transmission?.8:.18,clearcoatRoughness:.16,emissive:kind===3?skin.layers.layer_1_base.face_colors[faces[face]!]!:'#000000',emissiveIntensity:kind===3?.15:0});materials.push(material);
  const mesh=new Mesh(cap,material),normal=new Vector3(...normals[face] as [number,number,number]),up=normal.y?new Vector3(0,0,-normal.y):new Vector3(0,1,0),right=new Vector3().crossVectors(up,normal);
  mesh.position.copy(normal).multiplyScalar(kind>=7?1.51:1.52).addScaledVector(right,tile%3-1).addScaledVector(up,1-Math.floor(tile/3));mesh.quaternion.setFromUnitVectors(new Vector3(0,0,1),normal);root.add(mesh);
 }
 const draw=()=>renderer.render(scene,camera),resize=()=>{renderer.setSize(stage.clientWidth,stage.clientHeight,false);camera.aspect=stage.clientWidth/stage.clientHeight;camera.updateProjectionMatrix();draw();};const observer=new ResizeObserver(resize);observer.observe(stage);controls.addEventListener('change',draw);
 const reverse=document.createElement('button');reverse.textContent='Xem ba mặt còn lại';reverse.onclick=()=>{camera.position.multiplyScalar(-1);controls.update();draw();};card.append(reverse);resize();
 disposers.push(()=>{observer.disconnect();controls.dispose();textures.forEach(t=>t.dispose());materials.forEach(m=>m.dispose());bodyMaterial.dispose();geometry.dispose();cap.dispose();environment.dispose();renderer.dispose();renderer.domElement.remove();});
}
const dispose=()=>disposers.splice(0).forEach(fn=>fn());window.addEventListener('pagehide',dispose,{once:true});if(import.meta.hot)import.meta.hot.dispose(dispose);





