import { ENGINE_VERSION } from '@rubik/engine';
import { CubeRenderer } from '@rubik/renderer';
import { DemoController } from './controller.js';
import './style.css';

const container = document.querySelector<HTMLElement>('#viewport')!;
const loading = document.querySelector<HTMLElement>('#loading')!;
document.querySelector('#engine-version')!.textContent = `Engine ${ENGINE_VERSION}`;
let controller: DemoController | undefined;
const sizeSelect = document.querySelector<HTMLSelectElement>('#cube-size')!;
const description = document.querySelector<HTMLElement>('#cube-description')!;
const seed = document.querySelector<HTMLInputElement>('#seed')!;
const scrambleButton = document.querySelector<HTMLButtonElement>('#scramble')!;
const resetButton = document.querySelector<HTMLButtonElement>('#reset')!;
const scrambleText = document.querySelector<HTMLElement>('#scramble-text')!;
seed.value = crypto.randomUUID();
const disableControls = (): void => {
  sizeSelect.disabled = seed.disabled = scrambleButton.disabled = resetButton.disabled = true;
};
try {
  controller = new DemoController(new CubeRenderer(container));
  loading.remove();
} catch (error) {
  loading.textContent = 'Không khởi tạo được WebGL. Hãy thử bật tăng tốc đồ họa hoặc dùng trình duyệt khác.';
  disableControls();
  console.error(error);
}
const onSizeChange = (): void => {
  try {
    const size = Number(sizeSelect.value);
    controller?.setSize(size);
    description.textContent = `Rubik ${size}×${size} · Trạng thái đã giải`;
    scrambleText.textContent = 'Chưa có scramble.';
  } catch (error) {
    description.textContent = 'Không dựng được khối. Hãy tải lại trang để thử lại.';
    disableControls();
    console.error(error);
  }
};
sizeSelect.addEventListener('change', onSizeChange);
const onReset = (): void => {
  controller?.reset();
  description.textContent = `Rubik ${sizeSelect.value}×${sizeSelect.value} · Trạng thái đã giải`;
  scrambleText.textContent = 'Chưa có scramble.';
};
const onScramble = (): void => {
  const moves = controller?.scramble(seed.value);
  if (!moves) return;
  scrambleText.textContent = moves.join(' ');
  description.textContent = `Rubik ${sizeSelect.value}×${sizeSelect.value} · Đã trộn`;
};
resetButton.addEventListener('click', onReset);
scrambleButton.addEventListener('click', onScramble);
const onPageHide = (event: PageTransitionEvent): void => {
  if (!event.persisted) controller?.dispose();
};
window.addEventListener('pagehide', onPageHide);
if (import.meta.hot) import.meta.hot.dispose(() => {
  window.removeEventListener('pagehide', onPageHide);
  sizeSelect.removeEventListener('change', onSizeChange);
  resetButton.removeEventListener('click', onReset);
  scrambleButton.removeEventListener('click', onScramble);
  controller?.dispose();
});
