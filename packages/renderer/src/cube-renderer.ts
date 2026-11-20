import { FACE_NORMALS, viewFaces } from './view.js';
import type { FaceName, FaceView } from './view.js';
import {
  AmbientLight, Box3, BoxGeometry, CylinderGeometry, DirectionalLight, EdgesGeometry, Group, LineBasicMaterial, LineSegments, Mesh, MeshPhysicalMaterial, MeshStandardMaterial, OctahedronGeometry,
  Raycaster, Vector2, Plane, PerspectiveCamera, Scene, Shape, ShapeGeometry, SRGBColorSpace, TorusGeometry, Vector3, WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { parseMove } from '@rubik/engine';
import type { Move } from '@rubik/engine';
import { buildLayout, layerSlots, rotationFor } from './layout.js';
import { advanceProgress, animationProgress } from './animator.js';
import type { CubeLayout, LayoutOptions } from './layout.js';
import { WESTERN_COLORS, validateDisplayState, validateTheme } from './colors.js';
import type { ColorTheme } from './colors.js';
import { InstancedCube } from './instanced-cube.js';
import { SurfaceMaterials } from './surface.js';
import type { CubeSurface } from './surface.js';
import { StickerArtwork } from './sticker-artwork.js';
import {DecorationBatches,groupBodyFaces} from './decoration-batches.js';
import {mouseOrbit} from './mouse-orbit.js';

export interface RendererOptions extends LayoutOptions { size?: number; stickerShape?: 'hexagon'|'stone'; stickerCornerRatio?:number; theme?: ColorTheme; surface?: CubeSurface; measurePerformance?: boolean; instancing?: boolean; centerCornerRatio?: number; coreMagnetColor?: number; fillLightIntensity?: number; resinCoreColor?: number; coreGemColor?: number; detailSize?: 2|3; optimize?: boolean }
export interface MoveSnapshot { move: Move; stateAfter: Uint8Array }
interface PreparedMove extends MoveSnapshot {
  rotation: ReturnType<typeof rotationFor>;
  selection: ReturnType<typeof layerSlots>;
  doubleTurn: boolean;
}

function hexagonalSticker(side:number):ShapeGeometry {
  const shape=new Shape(),r=side/2,cut=side*.17;
  // Broad six-sided cap: clip opposite corners, keep most of the square's area.
  const corners=[[-r,-r],[r-cut,-r],[r,-r+cut],[r,r],[-r+cut,r],[-r,r-cut]];
  corners.forEach(([x,y],i)=>{i?shape.lineTo(x!,y!):shape.moveTo(x!,y!);});
  shape.closePath();const geometry=new ShapeGeometry(shape),uv=geometry.getAttribute('uv');
  for(let i=0;i<uv.count;i++)uv.setXY(i,uv.getX(i)/side+.5,uv.getY(i)/side+.5);
  return geometry;
}
function stoneSticker(side:number):ShapeGeometry {
  // Square-sized stone cap with long sides and short, lightly chamfered corners.
  const shape=new Shape(),r=side/2,cut=side*.10;
  const corners=[[-r+cut,-r],[r-cut,-r],[r,-r+cut],[r,r-cut],[r-cut,r],[-r+cut,r],[-r,r-cut],[-r,-r+cut]];
  corners.forEach(([x,y],i)=>{i?shape.lineTo(x!,y!):shape.moveTo(x!,y!);});
  shape.closePath();const geometry=new ShapeGeometry(shape),uv=geometry.getAttribute('uv');
  for(let i=0;i<uv.count;i++)uv.setXY(i,uv.getX(i)/side+.5,uv.getY(i)/side+.5);
  return geometry;
}
function roundedSticker(side: number, cornerRatio=0.09): ShapeGeometry {
  const half = side / 2, radius = side * cornerRatio;
  const shape = new Shape();
  shape.moveTo(-half + radius, -half);
  shape.lineTo(half - radius, -half);
  shape.quadraticCurveTo(half, -half, half, -half + radius);
  shape.lineTo(half, half - radius);
  shape.quadraticCurveTo(half, half, half - radius, half);
  shape.lineTo(-half + radius, half);
  shape.quadraticCurveTo(-half, half, -half, half - radius);
  shape.lineTo(-half, -half + radius);
  shape.quadraticCurveTo(-half, -half, -half + radius, -half);
  const geometry = new ShapeGeometry(shape, 4);
  const uv = geometry.getAttribute('uv');
  for (let index = 0; index < uv.count; index++) uv.setXY(index,uv.getX(index)/side+0.5,uv.getY(index)/side+0.5);
  return geometry;
}

/** Display and animation only. Cube state and move application belong to the controller. */
export class CubeRenderer {
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(40, 1, 0.1, 100);
  private readonly webgl: WebGLRenderer;
  private controls: OrbitControls;
  private readonly mouseCamera:ReturnType<typeof mouseOrbit>;
  private geometry: BoxGeometry | undefined;
  private centerGeometry: ShapeGeometry | undefined;
  private stoneGeometries:ShapeGeometry[]=[];
  private magnetGeometry: CylinderGeometry | undefined;
  private magnetMaterial: MeshStandardMaterial | undefined;
  private magnetRimGeometry: TorusGeometry | undefined;
  private magnetRimMaterial: MeshStandardMaterial | undefined;
  private coreGemGeometry: OctahedronGeometry | undefined;
  private coreGemMaterial: MeshPhysicalMaterial | undefined;
  private stickerGeometry: ShapeGeometry | undefined;
  private readonly cubeGroup = new Group();
  private plasticMaterial: MeshStandardMaterial | undefined;
  private resinMaterial: MeshPhysicalMaterial | undefined;
  private resinInsert: MeshStandardMaterial | undefined;
  private resinInsertGeometry: BoxGeometry | undefined;
  private resinEdges: EdgesGeometry | undefined;
  private resinEdgeMaterial: LineBasicMaterial | undefined;
  private materials: MeshStandardMaterial[] = [];
  private stickers: Mesh<ShapeGeometry, MeshStandardMaterial>[] = [];
  private bodies: Mesh<BoxGeometry, MeshStandardMaterial | MeshStandardMaterial[]>[] = [];
  private readonly pivot = new Group();
  private readonly rotationAxis = new Vector3();
  private queue: PreparedMove[] = [];
  private active: { item: PreparedMove; progress: number; lastFrameTime: number | undefined; startAngle?: number } | undefined;
  private dragAngle: number | undefined;
  private msPerQuarterTurn = 150;
  private instant = false;
  private idleNotified = true;
  onMoveAnimated: (move: Move) => void = () => {};
  onIdle: () => void = () => {};
  onContextChange: (available: boolean) => void = () => {};
  private contextLost = false;
  private readonly measurePerformance: boolean;
  private lastRenderMs = 0;
  private instances: InstancedCube | undefined;
  private readonly instancing: boolean;
  private size = 0;
  private stickerColors = new Uint8Array(0);
  private artwork: StickerArtwork | undefined;
  private artworkGeometries: ShapeGeometry[] = [];
  private artworkRotations = new Uint8Array(0);
  private theme: ColorTheme;
  private surface: CubeSurface | undefined;
  private surfaceMaterials: SurfaceMaterials | undefined;
  private layoutOptions: RendererOptions;
  private readonly ambientLight = new AmbientLight(0xffffff, 2);
  private fillLight:DirectionalLight|undefined;
  private readonly observer: ResizeObserver;
  private frame = 0;
  private dirty=true;
  private renderedFrames=0;
  private decorations:DecorationBatches|undefined;
  private readonly bodyGeometries:BoxGeometry[]=[];
  private disposed = false;

  constructor(private readonly container: HTMLElement, options: RendererOptions = {}) {
    const layout = buildLayout(options.size ?? 3, options);
    validateTheme(options.theme ?? WESTERN_COLORS);
    this.theme = [...(options.theme ?? WESTERN_COLORS)];
    this.surface = options.surface;
    this.layoutOptions = { ...options };
    this.measurePerformance = options.measurePerformance ?? false;
    this.instancing = options.instancing ?? true;
    this.webgl = new WebGLRenderer({ antialias: true, alpha: true });
    this.webgl.outputColorSpace = SRGBColorSpace;
    this.webgl.domElement.setAttribute('role', 'img');
    this.camera.position.set(6, 5, 7);
    this.mouseCamera=mouseOrbit(this.webgl.domElement,this.camera,()=>this.controls.enabled&&!this.contextLost,()=>{
      const enabled=this.controls.enabled;
      this.controls.dispose();this.controls=this.createControls();this.controls.enabled=enabled;this.requestDraw();
    },this.requestDraw);
    this.controls = this.createControls();
    this.controls.enablePan = false;
    this.controls.enableDamping = true;
    this.controls.minDistance = 5;
    this.controls.maxDistance = 18;
    this.controls.target.set(0, 0, 0);
    this.rebuild(layout);
    this.scene.add(this.cubeGroup);
    this.scene.add(this.ambientLight);
    const light = new DirectionalLight(0xffffff, 3);
    light.position.set(4, 6, 8);
    this.scene.add(light);
    if (options.fillLightIntensity) {
      const fill = new DirectionalLight(0xffffff,options.fillLightIntensity);
      this.fillLight=fill;
      fill.position.set(-4,-5,-6);
      this.scene.add(fill);
    }
    this.observer = new ResizeObserver(this.resize);
    this.container.append(this.webgl.domElement);
    this.observer.observe(this.container);
    window.addEventListener('resize', this.resize);
    this.webgl.domElement.addEventListener('webglcontextlost', this.onContextLost);
    this.webgl.domElement.addEventListener('webglcontextrestored', this.onContextRestored);
    this.resize();
    if(!this.frame)this.frame = requestAnimationFrame(this.draw);
  }

  private readonly requestDraw=():void=>{
    this.dirty=true;
    if(this.layoutOptions.optimize&&!this.disposed&&!this.contextLost&&!this.frame)this.frame=requestAnimationFrame(this.draw);
  };

  enableOrbit(enabled: boolean): void {
    if (!this.disposed) this.controls.enabled = enabled;
  }

  private createControls():OrbitControls {
    const controls=new OrbitControls(this.camera,this.webgl.domElement);
    controls.mouseButtons={...controls.mouseButtons,LEFT:null,RIGHT:null};
    controls.enablePan=false;controls.enableDamping=true;controls.minDistance=5;controls.maxDistance=18;
    if(this.layoutOptions.optimize)controls.addEventListener('change',this.requestDraw);
    return controls;
  }

  get canvas(): HTMLCanvasElement { return this.webgl.domElement; }
  pick(clientX: number, clientY: number) {
    if (this.pendingMoveCount || this.dragAngle !== undefined || this.contextLost) return null;
    const ray = this.pointerRay(clientX,clientY);
    this.scene.updateMatrixWorld(true);
    const hit=ray.intersectObjects(this.cubeGroup.children,true)[0];
    const layout=buildLayout(this.size,this.optionsForSize(this.size));
    const index=hit ? (this.instances ? (hit.object===this.instances.stickers ? hit.instanceId : undefined) : this.stickers.indexOf(hit.object as typeof this.stickers[number])) : undefined;
    if(index!==undefined&&index>=0)return {slot:layout.slots[index]!,point:hit!.point.clone()};
    // Plastic borders and gaps belong to the nearest cell on the frontmost face.
    const half=layout.edgeLength/2;
    const point=ray.ray.intersectBox(new Box3(new Vector3(-half,-half,-half),new Vector3(half,half,half)),new Vector3());
    if(!point)return null;
    const coordinates=point.toArray();
    const axis=coordinates.reduce((best,value,i)=>Math.abs(value)>Math.abs(coordinates[best]!)?i:best,0);
    const sign=Math.sign(coordinates[axis]!);
    let closest:typeof layout.slots[number]|undefined, distance=Infinity;
    for(const slot of layout.slots){
      if(slot.normal[axis]!==sign)continue;
      const next=point.distanceToSquared(new Vector3(...slot.position));
      if(next<distance){closest=slot;distance=next;}
    }
    return closest ? {slot:closest,point} : null;
  }
  private pointerRay(x: number,y: number): Raycaster {
    const rect=this.canvas.getBoundingClientRect();
    const ray=new Raycaster();
    this.camera.updateMatrixWorld();
    ray.setFromCamera(new Vector2((x-rect.left)/rect.width*2-1,-(y-rect.top)/rect.height*2+1),this.camera);
    return ray;
  }
  facePoint(x: number,y: number,normal: readonly number[],point: Vector3): Vector3 | null {
    return this.pointerRay(x,y).ray.intersectPlane(new Plane().setFromNormalAndCoplanarPoint(new Vector3(...normal as [number,number,number]),point),new Vector3());
  }
  beginDrag(move: Move): void {
    if (this.pendingMoveCount) throw new Error('Wait for animation');
    const parsed=parseMove(move,this.size), selection=layerSlots(parsed,this.size);
    this.rotationAxis.set(...rotationFor(parsed).axis);
    if (this.instances) this.instances.begin(selection);
    else {this.cubeGroup.add(this.pivot); for(const i of selection.cubieIndices)this.pivot.add(this.bodies[i]!);for(const i of selection.stickerIndices)this.pivot.add(this.stickers[i]!);}
    this.decorations?.begin(selection.cubieIndices);
    this.dragAngle=0;
  }
  updateDrag(angle: number): void {
    if (this.dragAngle===undefined || !Number.isFinite(angle)) return;
    this.dragAngle=angle;this.pivot.quaternion.setFromAxisAngle(this.rotationAxis,angle);this.instances?.rotate(this.pivot.quaternion);this.decorations?.rotate(this.pivot.quaternion);this.requestDraw();
  }
  endDrag(): number { const angle=this.dragAngle??0;this.dragAngle=undefined;this.cancelAnimation();return angle; }
  resumeDrag(angle: number): void {if(this.active){this.active.startAngle=angle;if(this.active.item.doubleTurn && angle<0)this.active.item.rotation.angle=-Math.PI;}}
  zoomBy(factor: number): void {
    const distance=this.camera.position.distanceTo(this.controls.target);
    const next=Math.min(18,Math.max(5,distance*factor));
    this.camera.position.sub(this.controls.target).multiplyScalar(next/distance).add(this.controls.target);
    this.requestDraw();
  }

  resetCamera(): void { this.setCameraView('ufr'); }

  /** Project the visible portion of a turn into canvas coordinates. */
  getTurnScreenDirection(move: Move): {x:number;y:number} {
    const parsed=parseMove(move,this.size);
    const {axis,angle}=rotationFor(parsed);
    const {stickerIndices}=layerSlots(parsed,this.size);
    const layout=buildLayout(this.size,this.optionsForSize(this.size));
    const rect=this.canvas.getBoundingClientRect();
    this.camera.updateMatrixWorld();
    const spin=new Vector3(...axis);
    let score=0, direction={x:1,y:0};
    for(const index of stickerIndices){
      const slot=layout.slots[index]!;
      const point=new Vector3(...slot.position);
      const visible=new Vector3(...slot.normal).dot(this.camera.position.clone().sub(point).normalize());
      if(visible<=0)continue;
      const start=point.clone().project(this.camera);
      const end=point.clone().applyAxisAngle(spin,0.03).project(this.camera);
      const x=(end.x-start.x)*rect.width,y=(start.y-end.y)*rect.height;
      const weight=Math.hypot(x,y)*visible;
      if(weight>score){
        score=weight;
        direction={x:x*Math.sign(angle),y:y*Math.sign(angle)};
      }
    }
    return direction;
  }

  copyCameraTo(camera: PerspectiveCamera): void {
    this.camera.updateMatrixWorld();
    camera.copy(this.camera);
  }

  getViewFaces() {
    this.camera.updateMatrixWorld();
    const half=buildLayout(this.size,this.optionsForSize(this.size)).edgeLength/2;
    const views:FaceView[]=[];
    for(const face of Object.keys(FACE_NORMALS) as FaceName[]){
      const n=new Vector3(...FACE_NORMALS[face]),centre=n.clone().multiplyScalar(half),p=centre.clone().project(this.camera);
      let area=0;
      if(n.dot(this.camera.position.clone().sub(centre))>0){
        const a=new Vector3(...(Math.abs(n.y)<0.5?[0,1,0]:[1,0,0]) as [number,number,number]),b=new Vector3().crossVectors(n,a);
        const corners=[[1,1],[-1,1],[-1,-1],[1,-1]].map(([x,y])=>centre.clone().addScaledVector(a,x!*half).addScaledVector(b,y!*half).project(this.camera));
        for(let i=0;i<4;i++){const q=corners[i]!,r=corners[(i+1)%4]!;area+=q.x*r.y-r.x*q.y;}area=Math.abs(area)/2;
      }
      views.push({face,area,x:p.x,y:p.y});
    }
    return viewFaces(views);
  }

  getPickTargets() {
    const rect=this.canvas.getBoundingClientRect();this.camera.updateMatrixWorld();
    return buildLayout(this.size,this.optionsForSize(this.size)).slots.flatMap(slot=>{
      const p=new Vector3(...slot.position).project(this.camera);
      const x=rect.left+(p.x+1)*rect.width/2,y=rect.top+(1-p.y)*rect.height/2;
      return this.pick(x,y)?.slot.index===slot.index ? [{x,y,index:slot.index}] : [];
    });
  }
  getDiagnostics() {
    return { size: this.size, backend: this.instances ? 'instanced' : 'mesh', pending: this.pendingMoveCount, drawCalls: this.webgl.info?.render.calls ?? 0,
      geometries: this.webgl.info?.memory.geometries ?? 0, triangles: this.webgl.info?.render.triangles ?? 0,
      renderMs: this.lastRenderMs, renderedFrames:this.renderedFrames, contextLost: this.contextLost, camera: this.camera.position.toArray() };
  }

  private readonly onContextLost = (event: Event): void => {
    event.preventDefault();
    if (this.disposed) return;
    this.contextLost = true;
    cancelAnimationFrame(this.frame);this.frame=0;
    this.clearQueue();
    this.onContextChange(false);
  };

  private readonly onContextRestored = (): void => {
    if (this.disposed || !this.contextLost) return;
    this.contextLost = false;
    this.frame = requestAnimationFrame(this.draw);
    this.onContextChange(true);
  };

  setCameraView(view: 'ufr' | 'dbl'): void {
    this.assertActive();
    if (view !== 'ufr' && view !== 'dbl') throw new RangeError('Unknown camera view');
    this.mouseCamera.cancel();
    const enabled=this.controls.enabled;
    this.controls.dispose();
    this.camera.up.set(0,1,0);
    this.camera.position.set(view === 'ufr' ? 6 : -6, view === 'ufr' ? 5 : -5, view === 'ufr' ? 7 : -7);
    this.controls=this.createControls();this.controls.enabled=enabled;this.requestDraw();
  }

  /** Rebuild only the cube; preserve the camera, canvas, controls and render loop. */
  setSize(size: number): void {
    this.assertActive();
    const layout = buildLayout(size, this.optionsForSize(size));
    this.cancelPending();
    if (size !== this.size) this.rebuild(layout);
    this.notifyIdle();
  }

  /** Change cosmetics on the existing canvas; the controller supplies logical state. */
  setAppearance(options:RendererOptions,state:Uint8Array):void {
    this.assertActive();
    validateDisplayState(state,this.size);
    validateTheme(options.theme??WESTERN_COLORS);
    const layout=buildLayout(this.size,options);
    this.cancelPending();
    this.layoutOptions={...options};
    const orbitEnabled=this.controls.enabled;
    this.controls.dispose();this.controls=this.createControls();this.controls.enabled=orbitEnabled;
    this.theme=[...(options.theme??WESTERN_COLORS)];
    this.surface=options.surface;
    if(!this.fillLight && options.fillLightIntensity){
      this.fillLight=new DirectionalLight();this.fillLight.position.set(-4,-5,-6);this.scene.add(this.fillLight);
    }
    if(this.fillLight)this.fillLight.intensity=options.fillLightIntensity??0;
    this.rebuild(layout);
    this.artwork?.reset(state);
    this.paint(state);
    this.requestDraw();
  }

  /** Paint immediately without retaining the caller's mutable state buffer. */
  setState(state: Uint8Array): void {
    this.assertActive();
    validateDisplayState(state, this.size);
    this.cancelPending();
    this.artwork?.reset(state);
    this.paint(state);
    this.notifyIdle();
  }

  private paint(state: Uint8Array): void {
    this.requestDraw();
    if (this.instances) { this.instances.paint(state, this.theme); return; }
    this.stickerColors.set(state);
    for (let index = 0; index < this.stickers.length; index++) {
      const color = state[index]!;
      this.stickers[index]!.material = this.surfaceMaterials?.stickerFor(color,this.artwork?.tile(index) ?? index%(this.size*this.size)) ?? this.materials[color]!;
      const geometry=this.artworkGeometries[index],turn=this.artwork?.rotation(index) ?? 0;
      if(geometry && this.artworkRotations[index]!==turn){
        const base=this.faceGeometry(index).getAttribute('uv'),uv=geometry.getAttribute('uv');
        for(let point=0;point<uv.count;point++){
          const u=base.getX(point),v=base.getY(point);
          uv.setXY(point,turn===0 ? u : turn===1 ? v : turn===2 ? 1-u : 1-v,
            turn===0 ? v : turn===1 ? 1-u : turn===2 ? 1-v : u);
        }
        uv.needsUpdate=true;
        this.artworkRotations[index]=turn;
      }
    }
  }

  get isAnimating(): boolean { return this.active !== undefined; }

  get pendingMoveCount(): number { return this.queue.length + (this.active ? 1 : 0); }

  enqueueMove(move: Move, stateAfter: Uint8Array): void {
    this.enqueueMoves([{ move, stateAfter }]);
  }

  /** Validate and copy the whole batch before changing the running queue. */
  enqueueMoves(moves: readonly MoveSnapshot[]): void {
    this.assertActive();
    const prepared = moves.map(({move, stateAfter}): PreparedMove => {
      const parsed = parseMove(move, this.size);
      validateDisplayState(stateAfter, this.size);
      return { move: parsed.canonical, stateAfter: stateAfter.slice(), rotation: rotationFor(parsed),
        selection: layerSlots(parsed, this.size), doubleTurn: parsed.quarterTurns === 2 };
    });
    if (!prepared.length) return;
    this.queue.push(...prepared);
    this.idleNotified = false;
    this.startNext();
  }

  setSpeed(msPerQuarterTurn: number): void {
    this.assertActive();
    if (!Number.isFinite(msPerQuarterTurn) || msPerQuarterTurn <= 0) throw new RangeError('Speed must be positive milliseconds');
    this.msPerQuarterTurn = msPerQuarterTurn;
  }

  setInstant(enabled: boolean): void { this.assertActive(); this.instant = enabled; }

  turnDuration(doubleTurn: boolean): number {
    return this.instant ? 0 : this.msPerQuarterTurn * (doubleTurn ? 1.5 : 1);
  }

  /** Skip unfinished visuals and paint the latest accepted snapshot; never undo controller state. */
  clearQueue(): void {
    this.assertActive();
    const finalState = this.queue.at(-1)?.stateAfter ?? this.active?.item.stateAfter;
    const skipped=[...(this.active ? [this.active.item] : []),...this.queue];
    for(const item of skipped)this.artwork?.advance(item.move,item.selection.stickerIndices);
    this.cancelPending();
    if (finalState) this.paint(finalState);
    this.notifyIdle();
  }

  private startNext(): void {
    if (this.active || this.disposed) return;
    const item = this.queue.shift();
    if (!item) return;
    this.rotationAxis.set(...item.rotation.axis);
    this.pivot.quaternion.identity();
    if (this.instances) this.instances.begin(item.selection);
    else {
      this.cubeGroup.add(this.pivot);
      for (const index of item.selection.cubieIndices) this.pivot.add(this.bodies[index]!);
      for (const index of item.selection.stickerIndices) this.pivot.add(this.stickers[index]!);
    }
    this.decorations?.begin(item.selection.cubieIndices);
    this.active = { item, progress: 0, lastFrameTime: undefined };
    this.requestDraw();
  }

  private cancelPending(): void {
    this.queue.length = 0;
    this.cancelAnimation();
  }

  private notifyIdle(): void {
    if (!this.disposed && this.pendingMoveCount === 0 && !this.idleNotified) {
      this.idleNotified = true;
      this.onIdle();
    }
  }

  private cancelAnimation(): void {
    this.dragAngle = undefined;
    this.active = undefined;
    this.pivot.quaternion.identity();
    this.instances?.end();this.decorations?.end();this.requestDraw();
    // add() preserves local slot transforms; do not attach() or accumulate rotations.
    while (this.pivot.children.length) this.cubeGroup.add(this.pivot.children[0]!);
    this.pivot.removeFromParent();
  }

  setTheme(theme: ColorTheme): void {
    this.assertActive();
    validateTheme(theme);
    this.theme = [...theme];
    if (this.surfaceMaterials) this.surfaceMaterials.setTheme(this.theme);
    else for (let color = 0; color < 6; color++) this.materials[color]!.color.setHex(theme[color]!);
    this.instances?.setTheme(this.theme);this.requestDraw();
  }

  setSurface(surface?: CubeSurface): void {
    this.assertActive();
    if (this.surface === surface) return;
    this.surface = surface;
    this.applySurface();
  }

  private applySurface(): void {
    this.ambientLight.intensity = this.surface?.ambientLightIntensity ?? 2;
    this.surfaceMaterials?.dispose();
    this.surfaceMaterials = new SurfaceMaterials(this.surface ?? {},this.plasticMaterial!,
      this.materials,this.instances?.stickers.material,this.theme,this.size<=3?this.size:0,true,this.requestDraw);
    const textured=this.size<=3 && Boolean((this.size===3 && this.surface?.stickers?.centerMap) || this.surface?.stickers?.tileAtlases?.some(Boolean));
    if(textured && !this.artworkGeometries.length){
      this.artworkGeometries=this.stickers.map((sticker,index)=>{
        const geometry=this.faceGeometry(index).clone();sticker.geometry=geometry;return geometry;
      });
      this.artworkRotations=new Uint8Array(this.stickers.length).fill(255);
    }else if(!textured && this.artworkGeometries.length){
      this.stickers.forEach((sticker,index)=>{sticker.geometry=this.faceGeometry(index);});
      this.artworkGeometries.forEach(geometry=>geometry.dispose());this.artworkGeometries=[];
    }
    if (!this.instances) this.paint(this.stickerColors);
  }

  private faceGeometry(index:number):ShapeGeometry {
    if(this.stoneGeometries.length)return this.stoneGeometries[index%9]!;
    return index % 9 === 4 && this.centerGeometry ? this.centerGeometry : this.stickerGeometry!;
  }

  private assertActive(): void {
    if (this.disposed) throw new Error('Renderer has been disposed');
  }

  private releaseCube(): void {
    this.decorations?.dispose();this.decorations=undefined;
    this.bodyGeometries.forEach(geometry=>geometry.dispose());this.bodyGeometries.length=0;
    this.cancelPending();
    this.surfaceMaterials?.dispose();
    this.surfaceMaterials = undefined;
    this.instances?.dispose();
    this.instances = undefined;
    this.cubeGroup.clear();
    this.stickers = [];
    this.bodies = [];
    this.artworkGeometries.forEach(geometry=>geometry.dispose());
    this.artworkGeometries=[];
    this.geometry?.dispose();
    this.centerGeometry?.dispose();this.centerGeometry=undefined;
    this.stoneGeometries.forEach(g=>g.dispose());this.stoneGeometries=[];
    this.magnetGeometry?.dispose();this.magnetGeometry=undefined;
    this.magnetMaterial?.dispose();this.magnetMaterial=undefined;
    this.magnetRimGeometry?.dispose();this.magnetRimGeometry=undefined;
    this.magnetRimMaterial?.dispose();this.magnetRimMaterial=undefined;
    this.coreGemGeometry?.dispose();this.coreGemGeometry=undefined;
    this.coreGemMaterial?.dispose();this.coreGemMaterial=undefined;
    this.stickerGeometry?.dispose();
    this.plasticMaterial?.dispose();
    this.resinMaterial?.dispose();this.resinMaterial=undefined;
    this.resinInsert?.dispose();this.resinInsert=undefined;
    this.resinInsertGeometry?.dispose();this.resinInsertGeometry=undefined;
    this.resinEdges?.dispose();this.resinEdges=undefined;
    this.resinEdgeMaterial?.dispose();this.resinEdgeMaterial=undefined;
    for (const material of this.materials) material.dispose();
  }

  private optionsForSize(size:number):RendererOptions {
    if(this.layoutOptions.detailSize===undefined||this.layoutOptions.detailSize===size)return this.layoutOptions;
    return this.layoutOptions.edgeLength===undefined ? {} : {edgeLength:this.layoutOptions.edgeLength};
  }

  private rebuild(layout: CubeLayout): void {
    const details=this.optionsForSize(layout.size);
    if(this.fillLight)this.fillLight.visible=this.layoutOptions.detailSize===undefined||this.layoutOptions.detailSize===layout.size;
    this.releaseCube();
    this.size = layout.size;
    this.stickerColors = Uint8Array.from(layout.slots,slot=>slot.face);
    this.artwork = layout.size<=3 ? new StickerArtwork(layout.size) : undefined;
    this.geometry = new BoxGeometry(layout.cubieSize, layout.cubieSize, layout.cubieSize);
    if(details.stickerShape==='stone')this.stoneGeometries=Array.from({length:9},()=>stoneSticker(layout.stickerSize));
    this.stickerGeometry = details.stickerShape === 'hexagon' ? hexagonalSticker(layout.stickerSize) : roundedSticker(layout.stickerSize,Math.max(.02,Math.min(.4,details.stickerCornerRatio??.09)));
    if (layout.size===3 && details.centerCornerRatio !== undefined && details.stickerShape !== 'hexagon' && details.stickerShape !== 'stone') {
      this.centerGeometry=roundedSticker(layout.stickerSize,Math.max(0.09,Math.min(0.45,details.centerCornerRatio)));
    }
    if (layout.size<=3 && details.coreMagnetColor !== undefined) {
      const unit=layout.cellSize;
      this.magnetGeometry=new CylinderGeometry(unit*0.112,unit*0.13,unit*0.038,32);
      this.magnetRimGeometry=new TorusGeometry(unit*0.106,unit*0.013,10,32);
      this.magnetMaterial=new MeshStandardMaterial({color:0xab6b16,roughness:0.35,metalness:0.39});
      this.magnetRimMaterial=new MeshStandardMaterial({color:details.coreMagnetColor,roughness:0.23,metalness:0.35,emissive:0x9c6506,emissiveIntensity:0.20});
      if(details.coreGemColor!==undefined){
        this.coreGemGeometry=new OctahedronGeometry(unit*0.076);
        this.coreGemGeometry.scale(1,.30,1);
        this.coreGemMaterial=new MeshPhysicalMaterial({color:details.coreGemColor,roughness:0.13,
          metalness:0.12,clearcoat:0.96,clearcoatRoughness:0.08,flatShading:true,emissive:0x639cbd,emissiveIntensity:0.26});
      }
    }
    this.plasticMaterial = new MeshStandardMaterial({ color: 0x171b19, roughness: 0.7 });
    if (layout.size <= 3 && details.resinCoreColor !== undefined) {
      this.resinMaterial=new MeshPhysicalMaterial({color:details.resinCoreColor,transparent:true,opacity:0.38,
        depthWrite:false,roughness:0.23,metalness:0,clearcoat:0.83,clearcoatRoughness:0.16,emissive:0x886324,emissiveIntensity:0.16});
      this.resinInsert=new MeshStandardMaterial({color:0xc6aa6f,roughness:0.33,metalness:0.08,emissive:0x735a29,emissiveIntensity:0.24});
      const insertSize=layout.cubieSize*0.63;
      this.resinInsertGeometry=new BoxGeometry(insertSize,insertSize,insertSize);
      this.resinEdges=new EdgesGeometry(this.resinInsertGeometry);
      this.resinEdgeMaterial=new LineBasicMaterial({color:0xffefbd,transparent:true,opacity:0.43});
    }
    this.materials = this.theme.map(color => new MeshStandardMaterial({ color, roughness: 0.65, metalness: 0 }));
    if (this.instancing && layout.size >= 6) this.instances = new InstancedCube(this.cubeGroup, layout,
      this.geometry, this.stickerGeometry, this.plasticMaterial, this.theme);
    else {
    for (const cubie of layout.cubies) {
      const finish = this.resinMaterial ? Array.from({length:6},(_,side)=>{
        const axis=Math.floor(side/2), sign=side%2===0?1:-1;
        return cubie.coordinates[axis]===sign*(layout.size-1)?this.plasticMaterial!:this.resinMaterial!;
      }) : this.plasticMaterial;
      const grouped=this.layoutOptions.optimize&&Array.isArray(finish)?groupBodyFaces(this.geometry,finish):undefined;
      if(grouped)this.bodyGeometries.push(grouped.geometry);
      const body = new Mesh(grouped?.geometry??this.geometry, grouped?.materials??finish);
      body.position.set(...cubie.position);
      if (this.resinInsert && this.resinInsertGeometry && this.resinEdges && this.resinEdgeMaterial) {
        body.add(new Mesh(this.resinInsertGeometry,this.resinInsert));
        body.add(new LineSegments(this.resinEdges,this.resinEdgeMaterial));
      }
      if (this.magnetGeometry && this.magnetMaterial && this.magnetRimGeometry && this.magnetRimMaterial) {
        for (let axis=0;axis<3;axis++) for(const direction of [-1,1]) {
          if(cubie.coordinates[axis]===direction*(layout.size-1)) continue;
          const unit=layout.cellSize;
          const pod = new Mesh(this.magnetGeometry,this.magnetMaterial);
          const normal = new Vector3().setComponent(axis,direction);
          const corner = new Vector3(...cubie.coordinates).setComponent(axis,0).multiplyScalar(unit*0.296/(layout.size-1));
          pod.quaternion.setFromUnitVectors(new Vector3(0,1,0),normal);
          pod.position.copy(corner).addScaledVector(normal,layout.cubieSize/2-unit*0.026);
          const rim=new Mesh(this.magnetRimGeometry,this.magnetRimMaterial);
          rim.rotation.x=-Math.PI/2;
          rim.position.y=unit*0.019;
          pod.add(rim);
          if(this.coreGemGeometry && this.coreGemMaterial){
            const gem=new Mesh(this.coreGemGeometry,this.coreGemMaterial);
            gem.rotation.y=Math.PI/4;
            gem.position.y=unit*0.01;
            pod.add(gem);
          }
          body.add(pod);
        }
      }
      this.bodies.push(body);
      this.cubeGroup.add(body);
    }
    const forward = new Vector3(0, 0, 1), normal = new Vector3();
    for (const slot of layout.slots) {
      const sticker = new Mesh(this.faceGeometry(slot.index), this.materials[slot.face]!);
      normal.set(...slot.normal);
      sticker.position.set(...slot.position).addScaledVector(normal, layout.cellSize * 0.002);
      sticker.quaternion.setFromUnitVectors(forward, normal);
      this.stickers.push(sticker);
      this.cubeGroup.add(sticker);
    }
    }
    if(this.layoutOptions.optimize&&!this.instances)this.decorations=new DecorationBatches(this.cubeGroup,this.bodies);
    this.requestDraw();
    this.webgl.domElement.setAttribute('aria-label', `Rubik ${layout.size}×${layout.size}; kéo để xoay camera, cuộn để thu phóng`);
    if (this.surface) this.applySurface();
    else this.ambientLight.intensity = 2;
  }

  private readonly resize = (): void => {
    if (this.disposed) return;
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.webgl.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.webgl.setSize(width, height, false);
    this.requestDraw();
  };

  private readonly draw = (time = performance.now()): void => {
    if (this.disposed || this.contextLost) return;
    this.frame=0;this.dirty=false;
    // Bound instant work to the batch present at frame start; callbacks may enqueue more.
    const budget = this.instant ? this.pendingMoveCount : 1;
    for (let index = 0; index < budget; index++) {
      const active = this.active;
      if (!active) break;
      const previous = active.lastFrameTime ?? time;
      active.lastFrameTime = Math.max(previous, time);
      active.progress = this.instant ? 1 : advanceProgress(active.progress, time - previous,
        this.msPerQuarterTurn, active.item.doubleTurn, this.queue.length);
      this.pivot.quaternion.setFromAxisAngle(this.rotationAxis,
        (active.startAngle ?? 0) + (active.item.rotation.angle - (active.startAngle ?? 0)) * animationProgress(active.progress, 1));
      this.instances?.rotate(this.pivot.quaternion);this.decorations?.rotate(this.pivot.quaternion);
      if (active.progress < 1) break;
      this.artwork?.advance(active.item.move,active.item.selection.stickerIndices);
      this.cancelAnimation();
      this.paint(active.item.stateAfter);
      this.startNext();
      if (this.active) this.active.lastFrameTime = time;
      this.onMoveAnimated(active.item.move);
      if (this.disposed) return;
      if (!this.instant) break;
    }
    this.notifyIdle();
    if (this.disposed) return;
    if(!this.mouseCamera.active())this.controls.update();
    this.surfaceMaterials?.animate(time);
    const renderStart = this.measurePerformance ? performance.now() : 0;
    this.webgl.render(this.scene, this.camera);this.renderedFrames++;
    if (this.measurePerformance) this.lastRenderMs = performance.now() - renderStart;
    if(!this.layoutOptions.optimize||this.pendingMoveCount||this.surfaceMaterials?.isAnimated||this.dirty){
      if(!this.frame)this.frame = requestAnimationFrame(this.draw);
    }
  };

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    window.removeEventListener('resize', this.resize);
    this.observer.disconnect();
    this.webgl.domElement.removeEventListener('webglcontextlost', this.onContextLost);
    this.webgl.domElement.removeEventListener('webglcontextrestored', this.onContextRestored);
    this.mouseCamera.dispose();
    this.controls.dispose();
    this.releaseCube();
    this.scene.clear();
    this.webgl.dispose();
    this.webgl.forceContextLoss();
    this.webgl.domElement.remove();
  }
}
