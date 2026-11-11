import { ENGINE_VERSION, parseMove } from '@rubik/engine';
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
const moveControls = document.querySelector<HTMLFieldSetElement>('#move-controls')!;
const moveButtons = document.querySelector<HTMLElement>('#move-buttons')!;
const moveStatus = document.querySelector<HTMLElement>('#move-status')!;
const updateMoveControls = (): void => {
  moveControls.disabled = !controller || controller.renderer.isAnimating;
};
const buildMoveButtons = (): void => {
  moveButtons.replaceChildren();
  const candidates = ['R', "R'", 'R2', 'U', "U'", 'U2', 'F', "F'", 'F2', 'L', "L'", 'L2',
    'D', "D'", 'D2', 'B', "B'", 'B2', 'Rw', "Rw'", '3Rw', '2R', "2R'", '3R', 'M', 'E', 'S',
    'x', "x'", 'y', "y'", 'z', "z'"];
  for (const move of candidates) {
    try { parseMove(move, Number(sizeSelect.value)); } catch { continue; }
    const button = document.createElement('button');
    button.type = 'button'; button.dataset.move = move; button.textContent = move;
    moveButtons.append(button);
  }
};
seed.value = crypto.randomUUID();
const disableControls = (): void => {
  sizeSelect.disabled = seed.disabled = scrambleButton.disabled = resetButton.disabled = true;
  moveControls.disabled = true;
};
try {
  const renderer = new CubeRenderer(container);
  controller = new DemoController(renderer);
  renderer.onMoveAnimated = move => {
    updateMoveControls();
    moveStatus.textContent = `Đã xoay ${move}.`;
    description.textContent = `Rubik ${sizeSelect.value}×${sizeSelect.value} · ${controller!.cube.isSolved() ? 'Trạng thái đã giải' : 'Đang luyện tập'}`;
  };
  buildMoveButtons(); updateMoveControls();
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
    buildMoveButtons(); updateMoveControls(); moveStatus.textContent = '';
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
  updateMoveControls(); moveStatus.textContent = '';
};
const onScramble = (): void => {
  const moves = controller?.scramble(seed.value);
  if (!moves) return;
  scrambleText.textContent = moves.join(' ');
  description.textContent = `Rubik ${sizeSelect.value}×${sizeSelect.value} · Đã trộn`;
  updateMoveControls(); moveStatus.textContent = '';
};
const onMove = (event: MouseEvent): void => {
  const inputTime = performance.now();
  if (!(event.target instanceof HTMLButtonElement) || !event.target.dataset.move) return;
  const move = event.target.dataset.move;
  if (controller?.move(move, inputTime)) {
    updateMoveControls();
    moveStatus.textContent = `Đang xoay ${move}…`;
  }
};
moveButtons.addEventListener('click', onMove);
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
  moveButtons.removeEventListener('click', onMove);
  controller?.dispose();
});
