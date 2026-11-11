import {
  AmbientLight, BoxGeometry, DirectionalLight, Group, Mesh, MeshStandardMaterial,
  PerspectiveCamera, Scene, Shape, ShapeGeometry, SRGBColorSpace, Vector3, WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { buildLayout } from './layout.js';
import type { LayoutOptions } from './layout.js';
import { WESTERN_COLORS } from './colors.js';

export interface RendererOptions extends LayoutOptions { size?: number }

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

/** Static display only. Cube state and move application belong to the controller. */
export class CubeRenderer {
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(40, 1, 0.1, 100);
  private readonly webgl: WebGLRenderer;
  private readonly controls: OrbitControls;
  private readonly geometry: BoxGeometry;
  private readonly stickerGeometry: ShapeGeometry;
  private readonly cubeGroup = new Group();
  private readonly plasticMaterial = new MeshStandardMaterial({ color: 0x171b19, roughness: 0.7 });
  private readonly materials = WESTERN_COLORS
    .map(color => new MeshStandardMaterial({ color, roughness: 0.65, metalness: 0 }));
  private readonly observer: ResizeObserver;
  private frame = 0;
  private disposed = false;

  constructor(private readonly container: HTMLElement, options: RendererOptions = {}) {
    const layout = buildLayout(options.size ?? 3, options);
    this.webgl = new WebGLRenderer({ antialias: true, alpha: true });
    this.geometry = new BoxGeometry(layout.cubieSize, layout.cubieSize, layout.cubieSize);
    this.stickerGeometry = roundedSticker(layout.stickerSize);
    this.webgl.outputColorSpace = SRGBColorSpace;
    this.webgl.domElement.setAttribute('aria-label', `Rubik ${layout.size}×${layout.size} đã giải; kéo để xoay camera, cuộn để thu phóng`);
    this.webgl.domElement.setAttribute('role', 'img');
    this.camera.position.set(6, 5, 7);
    this.controls = new OrbitControls(this.camera, this.webgl.domElement);
    this.controls.enablePan = false;
    this.controls.enableDamping = true;
    this.controls.minDistance = 5;
    this.controls.maxDistance = 18;
    this.controls.target.set(0, 0, 0);
    for (const cubie of layout.cubies) {
      const body = new Mesh(this.geometry, this.plasticMaterial);
      body.position.set(...cubie.position);
      this.cubeGroup.add(body);
    }
    const forward = new Vector3(0, 0, 1), normal = new Vector3();
    for (const slot of layout.slots) {
      const sticker = new Mesh(this.stickerGeometry, this.materials[slot.face]!);
      normal.set(...slot.normal);
      // Offset only the mesh; layout slots stay on the ideal cube surface.
      sticker.position.set(...slot.position).addScaledVector(normal, layout.cellSize * 0.002);
      sticker.quaternion.setFromUnitVectors(forward, normal);
      this.cubeGroup.add(sticker);
    }
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

  private readonly resize = (): void => {
    if (this.disposed) return;
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.webgl.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.webgl.setSize(width, height, false);
  };

  private readonly draw = (): void => {
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
    this.geometry.dispose();
    this.stickerGeometry.dispose();
    this.plasticMaterial.dispose();
    this.cubeGroup.clear();
    for (const material of this.materials) material.dispose();
    this.scene.clear();
    this.webgl.dispose();
    this.webgl.forceContextLoss();
    this.webgl.domElement.remove();
  }
}
