import {
  AmbientLight, BoxGeometry, DirectionalLight, Mesh, MeshStandardMaterial,
  PerspectiveCamera, Scene, SRGBColorSpace, WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

/** R0 scene shell. Cube state and move application belong to the controller. */
export class CubeRenderer {
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(40, 1, 0.1, 100);
  private readonly webgl: WebGLRenderer;
  private readonly controls: OrbitControls;
  private readonly geometry = new BoxGeometry(3, 3, 3);
  // BoxGeometry's face order: +x, -x, +y, -y, +z, -z.
  private readonly materials = [0xc92a34, 0xf08022, 0xf5f5ed, 0xffd13b, 0x168751, 0x2466c5]
    .map(color => new MeshStandardMaterial({ color, roughness: 0.65, metalness: 0 }));
  private readonly observer: ResizeObserver;
  private frame = 0;
  private disposed = false;

  constructor(private readonly container: HTMLElement) {
    this.webgl = new WebGLRenderer({ antialias: true, alpha: true });
    this.webgl.outputColorSpace = SRGBColorSpace;
    this.webgl.domElement.setAttribute('aria-label', 'Khối tạm 3D; kéo để xoay camera, cuộn để thu phóng');
    this.webgl.domElement.setAttribute('role', 'img');
    this.camera.position.set(6, 5, 7);
    this.controls = new OrbitControls(this.camera, this.webgl.domElement);
    this.controls.enablePan = false;
    this.controls.enableDamping = true;
    this.controls.minDistance = 5;
    this.controls.maxDistance = 18;
    this.controls.target.set(0, 0, 0);
    this.scene.add(new Mesh(this.geometry, this.materials));
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
    for (const material of this.materials) material.dispose();
    this.scene.clear();
    this.webgl.dispose();
    this.webgl.domElement.remove();
  }
}
