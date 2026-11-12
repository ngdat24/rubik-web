import { FACE_NORMALS, viewFaces } from './view.js';
import type { FaceName, FaceView } from './view.js';
import {
  AmbientLight, BoxGeometry, DirectionalLight, Group, Mesh, MeshStandardMaterial,
  Raycaster, Vector2, Plane, PerspectiveCamera, Scene, Shape, ShapeGeometry, SRGBColorSpace, Vector3, WebGLRenderer,
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

export interface RendererOptions extends LayoutOptions { size?: number; theme?: ColorTheme; measurePerformance?: boolean; instancing?: boolean }
export interface MoveSnapshot { move: Move; stateAfter: Uint8Array }
interface PreparedMove extends MoveSnapshot {
  rotation: ReturnType<typeof rotationFor>;
  selection: ReturnType<typeof layerSlots>;
  doubleTurn: boolean;
}

function roundedSticker(side: number): ShapeGeometry {
  const half = side / 2, radius = side * 0.09;
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
  return new ShapeGeometry(shape, 4);
}

/** Display and animation only. Cube state and move application belong to the controller. */
export class CubeRenderer {
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(40, 1, 0.1, 100);
  private readonly webgl: WebGLRenderer;
  private readonly controls: OrbitControls;
  private geometry: BoxGeometry | undefined;
  private stickerGeometry: ShapeGeometry | undefined;
  private readonly cubeGroup = new Group();
  private plasticMaterial: MeshStandardMaterial | undefined;
  private materials: MeshStandardMaterial[] = [];
  private stickers: Mesh<ShapeGeometry, MeshStandardMaterial>[] = [];
  private bodies: Mesh<BoxGeometry, MeshStandardMaterial>[] = [];
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
  private theme: ColorTheme;
  private readonly layoutOptions: LayoutOptions;
  private readonly observer: ResizeObserver;
  private frame = 0;
  private disposed = false;

  constructor(private readonly container: HTMLElement, options: RendererOptions = {}) {
    const layout = buildLayout(options.size ?? 3, options);
    validateTheme(options.theme ?? WESTERN_COLORS);
    this.theme = [...(options.theme ?? WESTERN_COLORS)];
    this.layoutOptions = { ...options };
    this.measurePerformance = options.measurePerformance ?? false;
    this.instancing = options.instancing ?? true;
    this.webgl = new WebGLRenderer({ antialias: true, alpha: true });
    this.webgl.outputColorSpace = SRGBColorSpace;
    this.webgl.domElement.setAttribute('role', 'img');
    this.camera.position.set(6, 5, 7);
    this.controls = new OrbitControls(this.camera, this.webgl.domElement);
    this.controls.enablePan = false;
    this.controls.enableDamping = true;
    this.controls.minDistance = 5;
    this.controls.maxDistance = 18;
    this.controls.target.set(0, 0, 0);
    this.rebuild(layout);
    this.scene.add(this.cubeGroup);
    this.scene.add(new AmbientLight(0xffffff, 2));
    const light = new DirectionalLight(0xffffff, 3);
    light.position.set(4, 6, 8);
    this.scene.add(light);
    this.observer = new ResizeObserver(this.resize);
    this.container.append(this.webgl.domElement);
    this.observer.observe(this.container);
    window.addEventListener('resize', this.resize);
    this.webgl.domElement.addEventListener('webglcontextlost', this.onContextLost);
    this.webgl.domElement.addEventListener('webglcontextrestored', this.onContextRestored);
    this.resize();
    this.frame = requestAnimationFrame(this.draw);
  }

  enableOrbit(enabled: boolean): void {
    if (!this.disposed) this.controls.enabled = enabled;
  }

  get canvas(): HTMLCanvasElement { return this.webgl.domElement; }
  pick(clientX: number, clientY: number) {
    if (this.pendingMoveCount || this.dragAngle !== undefined || this.contextLost) return null;
    const ray = this.pointerRay(clientX,clientY);
    this.scene.updateMatrixWorld(true);
    const hit=ray.intersectObjects(this.cubeGroup.children,true)[0];
    if (!hit) return null;
    const index=this.instances ? (hit.object===this.instances.stickers ? hit.instanceId : undefined) : this.stickers.indexOf(hit.object as typeof this.stickers[number]);
    if (index===undefined || index<0) return null;
    return {slot:buildLayout(this.size,this.layoutOptions).slots[index]!, point:hit.point.clone()};
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
    this.dragAngle=0;
  }
  updateDrag(angle: number): void {
    if (this.dragAngle===undefined || !Number.isFinite(angle)) return;
    this.dragAngle=angle;this.pivot.quaternion.setFromAxisAngle(this.rotationAxis,angle);this.instances?.rotate(this.pivot.quaternion);
  }
  endDrag(): number { const angle=this.dragAngle??0;this.dragAngle=undefined;this.cancelAnimation();return angle; }
  resumeDrag(angle: number): void {if(this.active){this.active.startAngle=angle;if(this.active.item.doubleTurn && angle<0)this.active.item.rotation.angle=-Math.PI;}}
  zoomBy(factor: number): void {
    const distance=this.camera.position.distanceTo(this.controls.target);
    const next=Math.min(18,Math.max(5,distance*factor));
    this.camera.position.sub(this.controls.target).multiplyScalar(next/distance).add(this.controls.target);
  }

  resetCamera(): void { this.setCameraView('ufr'); }

  getViewFaces() {
    this.camera.updateMatrixWorld();
    const half=buildLayout(this.size,this.layoutOptions).edgeLength/2;
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
    return buildLayout(this.size,this.layoutOptions).slots.flatMap(slot=>{
      const p=new Vector3(...slot.position).project(this.camera);
      const x=rect.left+(p.x+1)*rect.width/2,y=rect.top+(1-p.y)*rect.height/2;
      return this.pick(x,y)?.slot.index===slot.index ? [{x,y,index:slot.index}] : [];
    });
  }
  getDiagnostics() {
    return { size: this.size, backend: this.instances ? 'instanced' : 'mesh', pending: this.pendingMoveCount, drawCalls: this.webgl.info?.render.calls ?? 0,
      geometries: this.webgl.info?.memory.geometries ?? 0, triangles: this.webgl.info?.render.triangles ?? 0,
      renderMs: this.lastRenderMs, contextLost: this.contextLost, camera: this.camera.position.toArray() };
  }

  private readonly onContextLost = (event: Event): void => {
    event.preventDefault();
    if (this.disposed) return;
    this.contextLost = true;
    cancelAnimationFrame(this.frame);
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
    const damping = this.controls.enableDamping;
    this.controls.enableDamping = false;
    this.controls.reset(); // consume any residual orbit delta before applying a preset
    this.camera.position.set(view === 'ufr' ? 6 : -6, view === 'ufr' ? 5 : -5, view === 'ufr' ? 7 : -7);
    this.controls.target.set(0, 0, 0);
    this.controls.update();
    this.controls.enableDamping = damping;
  }

  /** Rebuild only the cube; preserve the camera, canvas, controls and render loop. */
  setSize(size: number): void {
    this.assertActive();
    const layout = buildLayout(size, this.layoutOptions);
    this.cancelPending();
    if (size !== this.size) this.rebuild(layout);
    this.notifyIdle();
  }

  /** Paint immediately without retaining the caller's mutable state buffer. */
  setState(state: Uint8Array): void {
    this.assertActive();
    validateDisplayState(state, this.size);
    this.cancelPending();
    this.paint(state);
    this.notifyIdle();
  }

  private paint(state: Uint8Array): void {
    if (this.instances) { this.instances.paint(state, this.theme); return; }
    for (let index = 0; index < this.stickers.length; index++) {
      this.stickers[index]!.material = this.materials[state[index]!]!;
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

  /** Skip unfinished visuals and paint the latest accepted snapshot; never undo controller state. */
  clearQueue(): void {
    this.assertActive();
    const finalState = this.queue.at(-1)?.stateAfter ?? this.active?.item.stateAfter;
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
    this.active = { item, progress: 0, lastFrameTime: undefined };
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
    this.instances?.end();
    // add() preserves local slot transforms; do not attach() or accumulate rotations.
    while (this.pivot.children.length) this.cubeGroup.add(this.pivot.children[0]!);
    this.pivot.removeFromParent();
  }

  setTheme(theme: ColorTheme): void {
    this.assertActive();
    validateTheme(theme);
    this.theme = [...theme];
    for (let color = 0; color < 6; color++) this.materials[color]!.color.setHex(theme[color]!);
    this.instances?.setTheme(this.theme);
  }

  private assertActive(): void {
    if (this.disposed) throw new Error('Renderer has been disposed');
  }

  private releaseCube(): void {
    this.cancelPending();
    this.instances?.dispose();
    this.instances = undefined;
    this.cubeGroup.clear();
    this.stickers = [];
    this.bodies = [];
    this.geometry?.dispose();
    this.stickerGeometry?.dispose();
    this.plasticMaterial?.dispose();
    for (const material of this.materials) material.dispose();
  }

  private rebuild(layout: CubeLayout): void {
    this.releaseCube();
    this.size = layout.size;
    this.geometry = new BoxGeometry(layout.cubieSize, layout.cubieSize, layout.cubieSize);
    this.stickerGeometry = roundedSticker(layout.stickerSize);
    this.plasticMaterial = new MeshStandardMaterial({ color: 0x171b19, roughness: 0.7 });
    this.materials = this.theme.map(color => new MeshStandardMaterial({ color, roughness: 0.65, metalness: 0 }));
    if (this.instancing && layout.size >= 6) this.instances = new InstancedCube(this.cubeGroup, layout,
      this.geometry, this.stickerGeometry, this.plasticMaterial, this.theme);
    else {
    for (const cubie of layout.cubies) {
      const body = new Mesh(this.geometry, this.plasticMaterial);
      body.position.set(...cubie.position);
      this.bodies.push(body);
      this.cubeGroup.add(body);
    }
    const forward = new Vector3(0, 0, 1), normal = new Vector3();
    for (const slot of layout.slots) {
      const sticker = new Mesh(this.stickerGeometry, this.materials[slot.face]!);
      normal.set(...slot.normal);
      sticker.position.set(...slot.position).addScaledVector(normal, layout.cellSize * 0.002);
      sticker.quaternion.setFromUnitVectors(forward, normal);
      this.stickers.push(sticker);
      this.cubeGroup.add(sticker);
    }
    }
    this.webgl.domElement.setAttribute('aria-label', `Rubik ${layout.size}×${layout.size}; kéo để xoay camera, cuộn để thu phóng`);
  }

  private readonly resize = (): void => {
    if (this.disposed) return;
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.webgl.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.webgl.setSize(width, height, false);
  };

  private readonly draw = (time = performance.now()): void => {
    if (this.disposed || this.contextLost) return;
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
      this.instances?.rotate(this.pivot.quaternion);
      if (active.progress < 1) break;
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
    this.controls.update();
    const renderStart = this.measurePerformance ? performance.now() : 0;
    this.webgl.render(this.scene, this.camera);
    if (this.measurePerformance) this.lastRenderMs = performance.now() - renderStart;
    this.frame = requestAnimationFrame(this.draw);
  };

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    window.removeEventListener('resize', this.resize);
    this.observer.disconnect();
    this.webgl.domElement.removeEventListener('webglcontextlost', this.onContextLost);
    this.webgl.domElement.removeEventListener('webglcontextrestored', this.onContextRestored);
    this.controls.dispose();
    this.releaseCube();
    this.scene.clear();
    this.webgl.dispose();
    this.webgl.forceContextLoss();
    this.webgl.domElement.remove();
  }
}
