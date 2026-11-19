import {ACESFilmicToneMapping,AmbientLight,CanvasTexture,DirectionalLight,Group,Mesh,MeshPhysicalMaterial,MeshStandardMaterial,PerspectiveCamera,PMREMGenerator,PointLight,Scene,Vector3,WebGLRenderer} from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';

import {loadReference} from './purple-reference.js';
type Skin={skin_id:string;name:string;season_id:string;body:{color:string;roughness:number;metalness:number};layers:{layer_1_base:{face_colors:Record<string,string>};layer_2_surface:{roughness:number;metalness:number;transmission?:number;ior?:number;thickness?:number;anisotropy?:number;anisotropy_rotation_deg?:number;specular_intensity?:number;normal_scale:number}}};
function mountSkin(slot: SkinSlot, referenceTile: Awaited<ReturnType<typeof loadReference>>) {
 const {kind,skin,stage,reverse,position}=slot;
 const renderer=new WebGLRenderer({alpha:true,antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.toneMapping=ACESFilmicToneMapping;renderer.toneMappingExposure=.85;stage.append(renderer.domElement);
 const scene=new Scene(),camera=new PerspectiveCamera(38,1,.1,100);camera.position.copy(position);const controls=new OrbitControls(camera,renderer.domElement);controls.enablePan=false;controls.minDistance=5;controls.maxDistance=16;controls.target.set(0,0,0);
 const room=new RoomEnvironment(),pmrem=new PMREMGenerator(renderer),environment=pmrem.fromScene(room,.04);scene.environment=environment.texture;room.dispose();pmrem.dispose();scene.add(new AmbientLight(0xffffff,.75));const key=new DirectionalLight(0xfff4df,2.9);key.position.set(4,6,5);scene.add(key);
 if(kind===3){const inner=new PointLight(0xffdfb2,2.2,6);inner.position.set(0,0,0);scene.add(inner);}
 const root=new Group();scene.add(root);const geometry=new RoundedBoxGeometry(.98,.98,.98,3,.055),cap=new RoundedBoxGeometry(kind>=7?.995:.92,kind>=7?.995:.92,kind>=7?.09:.065,3,kind>=7?.045:.065),bodyMaterial=new MeshStandardMaterial({roughness:skin.body.roughness,metalness:skin.body.metalness,color:kind===2?'#a9bdcf':kind===3?'#352d2b':kind===4?'#20130d':skin.body.color,transparent:kind===3,opacity:kind===3?.86:1}),materials:MeshPhysicalMaterial[]=[],textures:CanvasTexture[]=[];
 const surface=skin.layers.layer_2_surface,faces=['U','R','F','D','L','B'],normals=[[0,1,0],[1,0,0],[0,0,1],[0,-1,0],[-1,0,0],[0,0,-1]];
 for(let x=-1;x<=1;x++)for(let y=-1;y<=1;y++)for(let z=-1;z<=1;z++){if(!x&&!y&&!z)continue;const body=new Mesh(geometry,bodyMaterial);body.position.set(x,y,z);root.add(body);}
 for(let face=0;face<6;face++)for(let tile=0;tile<9;tile++){
  const reference=referenceTile(face,tile);const map=reference.map,bump=reference.bump;textures.push(map,bump);
  const material=new MeshPhysicalMaterial({color:'#ffffff',map,bumpMap:bump,bumpScale:surface.normal_scale*.045,roughness:surface.roughness,metalness:Math.min(surface.metalness,.55),transmission:Math.min(surface.transmission??0,.18),ior:surface.ior??1.5,thickness:surface.thickness??.3,anisotropy:surface.anisotropy??0,anisotropyRotation:(surface.anisotropy_rotation_deg??0)*Math.PI/180,specularIntensity:surface.specular_intensity??.5,clearcoat:surface.transmission?.8:.18,clearcoatRoughness:.16,emissive:kind===3?skin.layers.layer_1_base.face_colors[faces[face]!]!:'#000000',emissiveIntensity:kind===3?.15:0});materials.push(material);
  const mesh=new Mesh(cap,material),normal=new Vector3(...normals[face] as [number,number,number]),up=normal.y?new Vector3(0,0,-normal.y):new Vector3(0,1,0),right=new Vector3().crossVectors(up,normal);
  mesh.position.copy(normal).multiplyScalar(kind>=7?1.51:1.52).addScaledVector(right,tile%3-1).addScaledVector(up,1-Math.floor(tile/3));mesh.quaternion.setFromUnitVectors(new Vector3(0,0,1),normal);root.add(mesh);
 }
 const draw=()=>renderer.render(scene,camera),resize=()=>{renderer.setSize(stage.clientWidth,stage.clientHeight,false);camera.aspect=stage.clientWidth/stage.clientHeight;camera.updateProjectionMatrix();draw();};const observer=new ResizeObserver(resize);observer.observe(stage);controls.addEventListener('change',draw);
 reverse.onclick=()=>{camera.position.multiplyScalar(-1);controls.update();};
 reverse.disabled=false;
 resize();
 return () => {
  position.copy(camera.position);
  reverse.onclick=null;
  reverse.disabled=true;
  observer.disconnect();
  controls.dispose();
  textures.forEach(texture=>texture.dispose());
  materials.forEach(material=>material.dispose());
  bodyMaterial.dispose();
  geometry.dispose();
  cap.dispose();
  environment.dispose();
  renderer.dispose();
  renderer.forceContextLoss();
  renderer.domElement.remove();
 };
}

interface SkinSlot {
 kind: number;
 skin: Skin;
 stage: HTMLDivElement;
 reverse: HTMLButtonElement;
 position: Vector3;
 visible: boolean;
 loading: boolean;
 unmount?: () => void;
}

const gallery=document.querySelector<HTMLElement>('#skins')!;
const slots=new Map<Element,SkinSlot>();
let disposed=false;

async function showSkin(slot: SkinSlot): Promise<void> {
 if(slot.loading || slot.unmount) return;
 slot.loading=true;
 slot.stage.textContent='Đang tải mẫu 3D…';
 try {
  const reference=await loadReference(slot.kind);
  if(disposed || !slot.visible) return;
  slot.stage.textContent='';
  slot.unmount=mountSkin(slot,reference);
 } catch {
  if(!disposed && slot.visible) slot.stage.textContent='Không thể tải mẫu 3D.';
 } finally {
  slot.loading=false;
 }
}

const visibility=new IntersectionObserver(entries=>{
 if(disposed)return;
 for(const entry of entries){
  const slot=slots.get(entry.target)!;
  slot.visible=entry.isIntersecting;
  if(slot.visible)continue;
  slot.unmount?.();
  delete slot.unmount;
  slot.stage.textContent='';
 }
 for(const entry of entries){
  if(entry.isIntersecting)void showSkin(slots.get(entry.target)!);
 }
},{rootMargin:'120px 0px'});

function dispose(): void {
 disposed=true;
 visibility.disconnect();
 window.removeEventListener('pagehide',onPageHide);
 for(const slot of slots.values())slot.unmount?.();
 slots.clear();
}

function onPageHide(event: PageTransitionEvent): void {
 if(!event.persisted)dispose();
}

window.addEventListener('pagehide',onPageHide);
if(import.meta.hot)import.meta.hot.dispose(dispose);

try {
 const response=await fetch('/assets/purple-skin-demo.json');
 if(!response.ok)throw new Error('Could not load skins');
 const skins:Skin[]=await response.json();
 if(!disposed)for(const [kind,skin] of skins.entries()){
  const card=document.createElement('article');
  const heading=document.createElement('h2');
  const caption=document.createElement('small');
  const stage=document.createElement('div');
  const reverse=document.createElement('button');
  heading.textContent=skin.name;
  caption.textContent=skin.season_id==='standard'?'Tiêu chuẩn · '+(kind<2?'Kim loại':'Kính và nhựa bán trong'):'Mùa 1';
  stage.className='stage';
  reverse.type='button';
  reverse.textContent='Xem ba mặt còn lại';
  reverse.disabled=true;
  card.append(heading,caption,stage,reverse);
  gallery.append(card);
  slots.set(stage,{kind,skin,stage,reverse,position:new Vector3(4.6,3.8,5.4),visible:false,loading:false});
  visibility.observe(stage);
 }
} catch {
 if(!disposed)gallery.textContent='Không thể tải danh sách skin.';
}
