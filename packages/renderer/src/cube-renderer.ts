import {
  AmbientLight, BoxGeometry, DirectionalLight, Group, Mesh, MeshStandardMaterial,
  PerspectiveCamera, Scene, Shape, ShapeGeometry, SRGBColorSpace, Vector3, WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { parseMove } from '@rubik/engine';
import type { Move } from '@rubik/engine';
import { buildLayout, layerSlots, rotationFor } from './layout.js';
import { advanceProgress, animationProgress } from './animator.js';
import type { CubeLayout, LayoutOptions } from './layout.js';
import { WESTERN_COLORS, validateDisplayState, validateTheme } from './colors.js';
import type { ColorTheme } from './colors.js';

export interface RendererOptions extends LayoutOptions { size?: number; theme?: ColorTheme }
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
  private active: { item: PreparedMove; progress: number; lastFrameTime: number | undefined } | undefined;
  private msPerQuarterTurn = 150;
  private instant = false;
  private idleNotified = true;
  onMoveAnimated: (move: Move) => void = () => {};
  onIdle: () => void = () => {};
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
    this.resize();
    this.frame = requestAnimationFrame(this.draw);
  }

  enableOrbit(enabled: boolean): void {
    if (!this.disposed) this.controls.enabled = enabled;
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
    this.cubeGroup.add(this.pivot);
    for (const index of item.selection.cubieIndices) this.pivot.add(this.bodies[index]!);
    for (const index of item.selection.stickerIndices) this.pivot.add(this.stickers[index]!);
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
    this.active = undefined;
    this.pivot.quaternion.identity();
    // add() preserves local slot transforms; do not attach() or accumulate rotations.
    while (this.pivot.children.length) this.cubeGroup.add(this.pivot.children[0]!);
    this.pivot.removeFromParent();
  }

  setTheme(theme: ColorTheme): void {
    this.assertActive();
    validateTheme(theme);
    this.theme = [...theme];
    for (let color = 0; color < 6; color++) this.materials[color]!.color.setHex(theme[color]!);
  }

  private assertActive(): void {
    if (this.disposed) throw new Error('Renderer has been disposed');
  }

  private releaseCube(): void {
    this.cancelPending();
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
    if (this.disposed) return;
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
        active.item.rotation.angle * animationProgress(active.progress, 1));
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
    this.webgl.render(this.scene, this.camera);
    this.frame = requestAnimationFrame(this.draw);
  };

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    window.removeEventListener('resize', this.resize);
    this.observer.disconnect();
    this.controls.dispose();
    this.releaseCube();
    this.scene.clear();
    this.webgl.dispose();
    this.webgl.forceContextLoss();
    this.webgl.domElement.remove();
  }
}
