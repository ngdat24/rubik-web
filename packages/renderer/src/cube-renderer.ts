import {
  AmbientLight, BoxGeometry, DirectionalLight, Group, Mesh, MeshStandardMaterial,
  PerspectiveCamera, Scene, Shape, ShapeGeometry, SRGBColorSpace, Vector3, WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { parseMove } from '@rubik/engine';
import type { Move } from '@rubik/engine';
import { buildLayout, layerSlots, rotationFor } from './layout.js';
import { animationProgress } from './animator.js';
import type { CubeLayout, LayoutOptions } from './layout.js';
import { WESTERN_COLORS, validateDisplayState, validateTheme } from './colors.js';
import type { ColorTheme } from './colors.js';

export interface RendererOptions extends LayoutOptions { size?: number; theme?: ColorTheme }

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
  private active: { move: Move; stateAfter: Uint8Array; startedAt: number; duration: number; angle: number } | undefined;
  onMoveAnimated: (move: Move) => void = () => {};
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
    this.cancelAnimation();
    if (size !== this.size) this.rebuild(layout);
  }

  /** Paint immediately without retaining the caller's mutable state buffer. */
  setState(state: Uint8Array): void {
    this.assertActive();
    validateDisplayState(state, this.size);
    this.cancelAnimation();
    for (let index = 0; index < this.stickers.length; index++) {
      this.stickers[index]!.material = this.materials[state[index]!]!;
    }
  }

  get isAnimating(): boolean { return this.active !== undefined; }

  /** R3 accepts one animation at a time. R4 will add an input queue. */
  enqueueMove(move: Move, stateAfter: Uint8Array): void {
    this.assertActive();
    if (this.active) throw new Error('Animation in progress');
    const parsed = parseMove(move, this.size);
    validateDisplayState(stateAfter, this.size);
    const selection = layerSlots(parsed, this.size);
    const rotation = rotationFor(parsed);
    this.rotationAxis.set(...rotation.axis);
    this.pivot.quaternion.identity();
    this.cubeGroup.add(this.pivot);
    for (const index of selection.cubieIndices) this.pivot.add(this.bodies[index]!);
    for (const index of selection.stickerIndices) this.pivot.add(this.stickers[index]!);
    this.active = { move: parsed.canonical, stateAfter: stateAfter.slice(), startedAt: performance.now(),
      duration: parsed.quarterTurns === 2 ? 225 : 150, angle: rotation.angle };
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
    this.cancelAnimation();
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
    const active = this.active;
    let completedMove: Move | undefined;
    if (active) {
      const elapsed = time - active.startedAt;
      this.pivot.quaternion.setFromAxisAngle(this.rotationAxis, active.angle * animationProgress(elapsed, active.duration));
      if (elapsed >= active.duration) {
        this.setState(active.stateAfter);
        completedMove = active.move;
      }
    }
    this.controls.update();
    this.webgl.render(this.scene, this.camera);
    this.frame = requestAnimationFrame(this.draw);
    if (completedMove !== undefined) this.onMoveAnimated(completedMove);
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
