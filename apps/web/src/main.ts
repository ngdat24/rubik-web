import { Cube, ENGINE_VERSION } from '@rubik/engine';
import { CubeRenderer } from '@rubik/renderer';
import './style.css';

// This controller owns the logical cube. Move input and snapshots arrive in R2/R3.
class DemoController {
  readonly cube = new Cube(3);
  readonly renderer: CubeRenderer;
  constructor(container: HTMLElement) { this.renderer = new CubeRenderer(container); }
  dispose(): void { this.renderer.dispose(); }
}

const container = document.querySelector<HTMLElement>('#viewport')!;
const loading = document.querySelector<HTMLElement>('#loading')!;
document.querySelector('#engine-version')!.textContent = `Engine ${ENGINE_VERSION}`;
let controller: DemoController | undefined;
try {
  controller = new DemoController(container);
  loading.remove();
} catch (error) {
  loading.textContent = 'Không khởi tạo được WebGL. Hãy thử bật tăng tốc đồ họa hoặc dùng trình duyệt khác.';
  console.error(error);
}
const onPageHide = (event: PageTransitionEvent): void => {
  if (!event.persisted) controller?.dispose();
};
window.addEventListener('pagehide', onPageHide);
if (import.meta.hot) import.meta.hot.dispose(() => {
  window.removeEventListener('pagehide', onPageHide);
  controller?.dispose();
});
