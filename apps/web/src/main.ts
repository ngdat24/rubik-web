import {t} from './i18n.js';
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
import {championAwards} from './champion-account.js';
import {mountPracticeChallenge} from './practice-challenge.js';
import {mountWallet} from './wallet.js';
import {mountQuestProgress} from './quest-progress.js';
import {mountWeeklyBoard} from './weekly-board.js';
import {mountShop} from './shop.js';
import {bindSkinEffects,readSkinLowFx,skinFxKey,skinPalette,skinSurface} from './skin-effects.js';
import type {Appearance} from './skin-effects.js';

let detachDrag: (()=>void) | undefined;
let timerUI: ReturnType<typeof attachTimer> | undefined;

const keySettings = mountKeySettings();
const viewLabelTimer=window.setInterval(()=>{
 const label=document.querySelector('#view-key-map')!;
 label.textContent=renderer && !document.querySelector<HTMLInputElement>('#view-keys')!.checked?Object.entries(renderer.getViewFaces()).map(([key,face])=>`${key} → ${face}`).join(' · '):t("Phím theo hệ trục khối");
},150);

let detachKeyboard: (() => void) | undefined;

const container = document.querySelector<HTMLElement>('#viewport')!;
const loading = document.querySelector<HTMLElement>('#loading')!;
let controller: CubeController | undefined;
let renderer: CubeRenderer | undefined;
const accountReady=mountAccount().catch(()=>{document.querySelector('#cloud-message')!.textContent=t("Chưa tạo được hồ sơ tự động; kiểm tra mạng hoặc bật Anonymous Sign-Ins trong Supabase. Kết quả vẫn lưu trên thiết bị.");return undefined;});
const championQuery=new URLSearchParams(location.search);
let championVariant=championQuery.get('champion');
const championSize=championQuery?.get('championSize')==='2'?2:3;
let championName:string|undefined;
if(!import.meta.env.DEV && (championVariant==='classic'||championVariant==='borderless')){
  const championAccount=await accountReady;
  const award=championAccount?await championAwards(championAccount).then(rows=>rows.find(row=>row.size===championSize)).catch(()=>undefined):undefined;
  if(award?.variant===championVariant)championName=award.name??undefined;
  else championVariant=null;
}
const champion=championVariant==='classic'||championVariant==='borderless'?await Promise.all([
  import('./champion-design.js'),import('./champion-frame.js'),import('./champion-motion.js')
]).then(async ([style,frame,motion])=>{
  const design=await style.loadChampionDesign(championSize);
  return {options:style.championRendererOptions(design,championVariant,championSize),
    name:championName??(import.meta.env.DEV?style.readChampionClaim(championSize)?.name:undefined)??design.name,sound:design.interaction_fx.sound_file,
    createFrame:frame.mountChampionFrame,createMotion:motion.mountChampionMotion};
}).catch(error=>{console.error(error);return undefined;}):undefined;
let championFrame:ReturnType<NonNullable<typeof champion>['createFrame']>|undefined;
let championMotion:ReturnType<NonNullable<typeof champion>['createMotion']>|undefined;
document.querySelector('#engine-version')!.textContent = `Engine ${ENGINE_VERSION}`;
let equippedAppearance:Appearance|undefined;
let equippedEffects:ReturnType<typeof bindSkinEffects>|undefined;
const lowFx=document.querySelector<HTMLInputElement>('#skin-low-fx')!;
lowFx.checked=readSkinLowFx();
const sizeSelect = document.querySelector<HTMLSelectElement>('#cube-size')!;
if(champion)sizeSelect.value=String(championSize);
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
  queueStatus.textContent = `${t("Chờ hiển thị: ")}${renderer?.pendingMoveCount ?? 0}${t(" nước")}`;
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
  renderer = new CubeRenderer(container, {...champion?.options,measurePerformance: diagnosticsEnabled,
    instancing: !(diagnosticsEnabled && new URLSearchParams(location.search).has('mesh'))});
  if (diagnosticsEnabled) Object.defineProperty(window, 'rubikDiagnostics', {value: (picking=false) => ({...renderer?.getDiagnostics(),...(picking?{pickTargets:renderer?.getPickTargets()}:{})}), configurable: true});
  renderer.setSpeed(Number(speed.value));
  controller = new CubeController(renderer,champion?championSize:3);
  if(champion){
    championFrame=champion.createFrame(container,champion.name,championSize);
    championMotion=champion.createMotion(container,renderer,controller,champion.sound,()=>controller?.size===championSize&&!lowFx.checked,championSize);
  }
  detachDrag = attachDrag(renderer,controller,updateMoveControls,championMotion?.commit);
  detachKeyboard = attachKeyboard(controller, move => {
    updateMoveControls();
    moveStatus.textContent = `${t("Đang xoay ")}${move}…`;
  }, keySettings.getKeymap,move=>!document.querySelector<HTMLInputElement>('#view-keys')!.checked?viewMove(move,renderer!.getViewFaces()):move);
  renderer.onContextChange = available => {
    if(available) controller!.unlockInput('context'); else controller!.lockInput('context');
    contextMessage.hidden = available;
    contextMessage.textContent = available ? '' : t("Kết nối đồ họa tạm mất. Đang chờ trình duyệt khôi phục; bạn có thể tải lại trang nếu cần.");
    moveControls.disabled = !available;
  };
  renderer.onMoveAnimated = move => {
    equippedEffects?.play();
    updateMoveControls();
    moveStatus.textContent = `${t("Đã xoay ")}${move}.`;
  };
  renderer.onIdle = () => {
    updateMoveControls();
    description.textContent = `Rubik ${sizeSelect.value}×${sizeSelect.value} · ${controller!.isSolved() ? t("Trạng thái đã giải") : t("Đang luyện tập")}`;
  };
  buildMoveButtons(); updateMoveControls();
  loading.remove();
} catch (error) {
  loading.textContent = t("Không khởi tạo được WebGL. Hãy thử bật tăng tốc đồ họa hoặc dùng trình duyệt khác.");
  disableControls();
  console.error(error);
}
const updateAppearance=()=>{
  if (!renderer) return;
  equippedEffects?.dispose();
  equippedEffects=undefined;
  const detailed=controller?.size===3;
  const usesChampion=Boolean(champion && controller?.size===championSize);
  championFrame?.show(usesChampion);
  if(champion && usesChampion){
    renderer.setTheme(champion.options.theme!);
    renderer.setSurface(champion.options.surface);
    return;
  }
  renderer.setTheme(skinPalette(equippedAppearance));
  const surface=detailed?skinSurface(equippedAppearance):undefined;
  if (surface && lowFx.checked) delete surface.pulse;
  renderer.setSurface(surface);
  if (detailed&&equippedAppearance&&!lowFx.checked) equippedEffects=bindSkinEffects(renderer,equippedAppearance);
};
const onLowFx=()=>{
  try {localStorage.setItem(skinFxKey,lowFx.checked?'1':'0');} catch {/* Preference remains applied for this page. */}
  updateAppearance();
};
lowFx.addEventListener('change',onLowFx);
const onSizeChange = (): void => {
  try {
    const size = Number(sizeSelect.value);
    controller?.setSize(size);
    updateAppearance();
    description.textContent = `Rubik ${size}×${size}${t(" · Trạng thái đã giải")}`;
    scrambleText.textContent = t("Chưa có scramble.");
    buildMoveButtons(); updateMoveControls(); moveStatus.textContent = '';
  } catch (error) {
    description.textContent = t("Không dựng được khối. Hãy tải lại trang để thử lại.");
    disableControls();
    console.error(error);
  }
};
sizeSelect.addEventListener('change', onSizeChange);
const onReset = (): void => {
  controller?.reset();
  description.textContent = `Rubik ${sizeSelect.value}×${sizeSelect.value}${t(" · Trạng thái đã giải")}`;
  scrambleText.textContent = t("Chưa có scramble.");
  updateMoveControls(); moveStatus.textContent = '';
};
const onScramble = (): boolean => {
  const moves = controller?.scramble(seed.value);
  if (!moves) return false;
  timerUI?.scrambled(seed.value);
  scrambleText.textContent = moves.join(' ');
  description.textContent = `Rubik ${sizeSelect.value}×${sizeSelect.value}${t(" · Đã trộn")}`;
  updateMoveControls(); moveStatus.textContent = '';
  return true;
};
const onMove = (event: MouseEvent): void => {
  const inputTime = performance.now();
  if (!(event.target instanceof HTMLButtonElement) || !event.target.dataset.move) return;
  const move = event.target.dataset.move;
  if (controller?.applyMove(move, inputTime)) {
    updateMoveControls();
    moveStatus.textContent = `${t("Đang xoay ")}${move}…`;
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
    moveStatus.textContent = count ? `${t("Đã nhận ")}${count}${t(" nước.")}` : t("Hãy nhập chuỗi nước đi.");
    updateMoveControls();
  } catch (error) {
    algorithmError.textContent = error instanceof Error ? t(error.message) : t("Chuỗi nước không hợp lệ.");
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
const account=await accountReady;
const wallet=mountWallet(account);
const quests=mountQuestProgress(account);
const weekly=mountWeeklyBoard();
const shop=mountShop(account,appearance=>{equippedAppearance=appearance;updateAppearance();},
  ()=>!timerUI?.isRunning(),()=>lowFx.checked);
const practice = controller && mountPracticeChallenge(account,controller,value=>{seed.value=value;return onScramble();},
  ()=>timerUI?.isRunning() ?? false);
if(controller) timerUI=attachTimer(controller,()=>{seed.value=newId();onScramble();},account,
  solve=>{
    if(solve.penalty!=='DNF'){
      if(solve.size===championSize&&!lowFx.checked)championFrame?.celebrate();
      equippedEffects?.play(true);
    }
    if(practice)void practice.completed(solve).then(()=>Promise.all([wallet.refresh(),quests.refresh()]));
  });
const onPageHide = (event: PageTransitionEvent): void => {
  if (!event.persisted) { championMotion?.dispose(); championFrame?.dispose(); practice?.dispose(); wallet.dispose(); quests.dispose(); weekly.dispose(); shop.dispose(); equippedEffects?.dispose(); lowFx.removeEventListener('change',onLowFx); account?.dispose();clearInterval(viewLabelTimer); timerUI?.dispose(); detachDrag?.(); detachKeyboard?.(); keySettings.dispose(); controller?.dispose(); }
};
window.addEventListener('pagehide', onPageHide);
if (import.meta.hot) import.meta.hot.dispose(() => {
  championMotion?.dispose();championFrame?.dispose();
  practice?.dispose();
  wallet.dispose();
  quests.dispose();
  weekly.dispose();
  shop.dispose();
  equippedEffects?.dispose();
  lowFx.removeEventListener('change',onLowFx);
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
