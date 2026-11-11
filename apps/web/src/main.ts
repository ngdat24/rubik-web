import { Cube, ENGINE_VERSION } from '@rubik/engine';
import { CubeRenderer } from '@rubik/renderer';
import './style.css';

// This controller owns the logical cube. Move input and snapshots arrive in R2/R3.
class DemoController {
  cube: Cube;
  renderer: CubeRenderer;
  constructor(private readonly container: HTMLElement, size = 3) {
    this.cube = new Cube(size);
    this.renderer = new CubeRenderer(container, { size });
  }
  setSize(size: number): void {
    const cube = new Cube(size);
    this.renderer.dispose();
    this.cube = cube;
    this.renderer = new CubeRenderer(this.container, { size });
  }
  dispose(): void { this.renderer.dispose(); }
}

const container = document.querySelector<HTMLElement>('#viewport')!;
const loading = document.querySelector<HTMLElement>('#loading')!;
document.querySelector('#engine-version')!.textContent = `Engine ${ENGINE_VERSION}`;
let controller: DemoController | undefined;
const sizeSelect = document.querySelector<HTMLSelectElement>('#cube-size')!;
const description = document.querySelector<HTMLElement>('#cube-description')!;
try {
  controller = new DemoController(container);
  loading.remove();
} catch (error) {
  loading.textContent = 'Không khởi tạo được WebGL. Hãy thử bật tăng tốc đồ họa hoặc dùng trình duyệt khác.';
  sizeSelect.disabled = true;
  console.error(error);
}
const onSizeChange = (): void => {
  try {
    const size = Number(sizeSelect.value);
    controller?.setSize(size);
    description.textContent = `Rubik ${size}×${size} · Trạng thái đã giải`;
  } catch (error) {
    description.textContent = 'Không dựng được khối. Hãy tải lại trang để thử lại.';
    sizeSelect.disabled = true;
    console.error(error);
  }
};
sizeSelect.addEventListener('change', onSizeChange);
const onPageHide = (event: PageTransitionEvent): void => {
  if (!event.persisted) controller?.dispose();
};
window.addEventListener('pagehide', onPageHide);
if (import.meta.hot) import.meta.hot.dispose(() => {
  window.removeEventListener('pagehide', onPageHide);
  sizeSelect.removeEventListener('change', onSizeChange);
  controller?.dispose();
});
