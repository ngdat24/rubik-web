import { newId } from './id.js';
import { ENGINE_VERSION, parseMove } from '@rubik/engine';
import { CubeRenderer, viewMove } from '@rubik/renderer';
import { CubeController } from '@rubik/controller';
import './style.css';
import { attachDrag } from './drag.js';

import { attachKeyboard } from './keyboard.js';
import { attachTimer } from './timer-controls.js';
import { mountKeySettings } from './key-settings.js';
import {mountAccount} from './account.js';

let detachDrag: (()=>void) | undefined;
let timerUI: ReturnType<typeof attachTimer> | undefined;

const keySettings = mountKeySettings();
const viewLabelTimer=window.setInterval(()=>{
 const label=document.querySelector('#view-key-map')!;
 label.textContent=renderer && !document.querySelector<HTMLInputElement>('#view-keys')!.checked?Object.entries(renderer.getViewFaces()).map(([key,face])=>`${key} → ${face}`).join(' · '):'Phím theo hệ trục khối';
},150);

let detachKeyboard: (() => void) | undefined;

const container = document.querySelector<HTMLElement>('#viewport')!;
const loading = document.querySelector<HTMLElement>('#loading')!;
document.querySelector('#engine-version')!.textContent = `Engine ${ENGINE_VERSION}`;
let controller: CubeController | undefined;
let renderer: CubeRenderer | undefined;
const sizeSelect = document.querySelector<HTMLSelectElement>('#cube-size')!;
const description = document.querySelector<HTMLElement>('#cube-description')!;
const seed = document.querySelector<HTMLInputElement>('#seed')!;
const scrambleButton = document.querySelector<HTMLButtonElement>('#scramble')!;
const resetButton = document.querySelector<HTMLButtonElement>('#reset')!;
const scrambleText = document.querySelector<HTMLElement>('#scramble-text')!;
const moveControls = document.querySelector<HTMLFieldSetElement>('#move-controls')!;
const moveButtons = document.querySelector<HTMLElement>('#move-buttons')!;
const moveStatus = document.querySelector<HTMLElement>('#move-status')!;
const queueStatus = document.querySelector<HTMLElement>('#queue-status')!;
const speed = document.querySelector<HTMLInputElement>('#speed')!;
const speedValue = document.querySelector<HTMLOutputElement>('#speed-value')!;
const instant = document.querySelector<HTMLInputElement>('#instant')!;
const cameraReset = document.querySelector<HTMLButtonElement>('#camera-reset')!;
const cameraBack = document.querySelector<HTMLButtonElement>('#camera-back')!;
const algorithmForm = document.querySelector<HTMLFormElement>('#algorithm-form')!;
const algorithm = document.querySelector<HTMLTextAreaElement>('#algorithm')!;
const algorithmError = document.querySelector<HTMLElement>('#algorithm-error')!;
const contextMessage = document.querySelector<HTMLElement>('#context-message')!;
const updateMoveControls = (): void => {
  moveControls.disabled = !controller || !contextMessage.hidden;
  queueStatus.textContent = `Chờ hiển thị: ${renderer?.pendingMoveCount ?? 0} nước`;
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
seed.value = newId();
const disableControls = (): void => {
  sizeSelect.disabled = seed.disabled = scrambleButton.disabled = resetButton.disabled = true;
  moveControls.disabled = true;
};
try {
  const diagnosticsEnabled = new URLSearchParams(location.search).has('diagnostics');
  renderer = new CubeRenderer(container, {measurePerformance: diagnosticsEnabled,
    instancing: !(diagnosticsEnabled && new URLSearchParams(location.search).has('mesh'))});
  if (diagnosticsEnabled) Object.defineProperty(window, 'rubikDiagnostics', {value: (picking=false) => ({...renderer?.getDiagnostics(),...(picking?{pickTargets:renderer?.getPickTargets()}:{})}), configurable: true});
  renderer.setSpeed(Number(speed.value));
  controller = new CubeController(renderer);
  detachDrag = attachDrag(renderer,controller,updateMoveControls);
  detachKeyboard = attachKeyboard(controller, move => {
    updateMoveControls();
    moveStatus.textContent = `Đang xoay ${move}…`;
  }, keySettings.getKeymap,move=>!document.querySelector<HTMLInputElement>('#view-keys')!.checked?viewMove(move,renderer!.getViewFaces()):move);
  renderer.onContextChange = available => {
    if(available) controller!.unlockInput('context'); else controller!.lockInput('context');
    contextMessage.hidden = available;
    contextMessage.textContent = available ? '' : 'Kết nối đồ họa tạm mất. Đang chờ trình duyệt khôi phục; bạn có thể tải lại trang nếu cần.';
    moveControls.disabled = !available;
  };
  renderer.onMoveAnimated = move => {
    updateMoveControls();
    moveStatus.textContent = `Đã xoay ${move}.`;
  };
  renderer.onIdle = () => {
    updateMoveControls();
    description.textContent = `Rubik ${sizeSelect.value}×${sizeSelect.value} · ${controller!.isSolved() ? 'Trạng thái đã giải' : 'Đang luyện tập'}`;
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
  timerUI?.scrambled(seed.value);
  scrambleText.textContent = moves.join(' ');
  description.textContent = `Rubik ${sizeSelect.value}×${sizeSelect.value} · Đã trộn`;
  updateMoveControls(); moveStatus.textContent = '';
};
const onMove = (event: MouseEvent): void => {
  const inputTime = performance.now();
  if (!(event.target instanceof HTMLButtonElement) || !event.target.dataset.move) return;
  const move = event.target.dataset.move;
  if (controller?.applyMove(move, inputTime)) {
    updateMoveControls();
    moveStatus.textContent = `Đang xoay ${move}…`;
  }
};
moveButtons.addEventListener('click', onMove);
const onSpeed = (): void => { renderer?.setSpeed(Number(speed.value)); speedValue.value = `${speed.value} ms`; };
const onInstant = (): void => { renderer?.setInstant(instant.checked); };
const onCameraReset = (): void => { renderer?.resetCamera(); };
const onCameraBack = (): void => { renderer?.setCameraView('dbl'); };
const onAlgorithm = (event: SubmitEvent): void => {
  const inputTime = performance.now();
  event.preventDefault();
  try {
    const count = controller?.sequence(algorithm.value, inputTime) ?? 0;
    algorithmError.textContent = '';
    algorithm.removeAttribute('aria-invalid');
    moveStatus.textContent = count ? `Đã nhận ${count} nước.` : 'Hãy nhập chuỗi nước đi.';
    updateMoveControls();
  } catch (error) {
    algorithmError.textContent = error instanceof Error ? error.message : 'Chuỗi nước không hợp lệ.';
    algorithm.setAttribute('aria-invalid', 'true');
  }
};
cameraReset.addEventListener('click', onCameraReset);
cameraBack.addEventListener('click', onCameraBack);
algorithmForm.addEventListener('submit', onAlgorithm);
speed.addEventListener('input', onSpeed);
instant.addEventListener('change', onInstant);


resetButton.addEventListener('click', onReset);
scrambleButton.addEventListener('click', onScramble);
const account=await mountAccount().catch(()=>{document.querySelector('#cloud-message')!.textContent='Chưa khởi tạo được đăng nhập; vẫn có thể chơi và lưu trên thiết bị.';return undefined;});
if(controller) timerUI=attachTimer(controller,()=>{seed.value=newId();onScramble();},account);
const onPageHide = (event: PageTransitionEvent): void => {
  if (!event.persisted) { account?.dispose();clearInterval(viewLabelTimer); timerUI?.dispose(); detachDrag?.(); detachKeyboard?.(); keySettings.dispose(); controller?.dispose(); }
};
window.addEventListener('pagehide', onPageHide);
if (import.meta.hot) import.meta.hot.dispose(() => {
  account?.dispose();
  clearInterval(viewLabelTimer);
  timerUI?.dispose();
  detachDrag?.();
  detachKeyboard?.();
  keySettings.dispose();
  window.removeEventListener('pagehide', onPageHide);
  sizeSelect.removeEventListener('change', onSizeChange);
  resetButton.removeEventListener('click', onReset);
  scrambleButton.removeEventListener('click', onScramble);
  moveButtons.removeEventListener('click', onMove);
  speed.removeEventListener('input', onSpeed);
  instant.removeEventListener('change', onInstant);


  cameraReset.removeEventListener('click', onCameraReset);
  cameraBack.removeEventListener('click', onCameraBack);
  algorithmForm.removeEventListener('submit', onAlgorithm);
  Reflect.deleteProperty(window, 'rubikDiagnostics');
  controller?.dispose();
});
