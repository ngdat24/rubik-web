import {t} from './i18n.js';
import { newId } from './id.js';
import { ENGINE_VERSION } from '@rubik/engine';
import { CubeRenderer, viewMove } from '@rubik/renderer';
import { CubeController } from '@rubik/controller';
import './style.css';
import { attachDrag } from './drag.js';

import { attachKeyboard } from './keyboard.js';
import { attachTimer } from './timer-controls.js';
import { mountKeySettings } from './key-settings.js';
import {mountAccount} from './account.js';
import {mountCommunityChat} from './community-chat.js';
import {mountChampionFrame} from './champion-frame.js';
import {mountChampionMotion} from './champion-motion.js';
import {mountWallet} from './wallet.js';
import {mountDailyQuests} from './daily-quests.js';
import {mountWeeklyBoard} from './weekly-board.js';
import {mountShop} from './shop.js';
import {bindSkinEffects,readSkinLowFx,skinFxKey,skinLayout,skinPalette,skinSurface} from './skin-effects.js';
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
const disposeCommunityChat=mountCommunityChat(accountReady);
type ChampionStyle={options:import('@rubik/renderer').RendererOptions;name:string;sound:string;size:2|3};
const championStyles=new Map<number,ChampionStyle>();
let champion:ChampionStyle|undefined;
let championSize:2|3=3;
let championFrame:ReturnType<typeof import('./champion-frame.js').mountChampionFrame>|undefined;
let championMotion:ReturnType<typeof import('./champion-motion.js').mountChampionMotion>|undefined;
let appearanceKey='';
const championRevisions=new Map<number,number>();
document.querySelector('#engine-version')!.textContent = `Engine ${ENGINE_VERSION}`;
let equippedAppearance:Appearance|undefined;
let equippedEffects:ReturnType<typeof bindSkinEffects>|undefined;
const lowFx=document.querySelector<HTMLInputElement>('#skin-low-fx')!;
lowFx.checked=readSkinLowFx();
const sizeSelect = document.querySelector<HTMLSelectElement>('#cube-size')!;

const description = document.querySelector<HTMLElement>('#cube-description')!;
const resetButton = document.querySelector<HTMLButtonElement>('#reset')!;
const scrambleText = document.querySelector<HTMLElement>('#scramble-text')!;
const moveControls = document.querySelector<HTMLFieldSetElement>('#move-controls')!;
const speed = document.querySelector<HTMLInputElement>('#speed')!;
const speedValue = document.querySelector<HTMLOutputElement>('#speed-value')!;
const instant = document.querySelector<HTMLInputElement>('#instant')!;
const contextMessage = document.querySelector<HTMLElement>('#context-message')!;
const disableControls = (): void => {
  sizeSelect.disabled = resetButton.disabled = true;
  moveControls.disabled = true;
};
try {
  const diagnosticsEnabled = new URLSearchParams(location.search).has('diagnostics');
  renderer = new CubeRenderer(container, {measurePerformance: diagnosticsEnabled,
    instancing: !(diagnosticsEnabled && new URLSearchParams(location.search).has('mesh'))});
  if (diagnosticsEnabled) Object.defineProperty(window, 'rubikDiagnostics', {value: (picking=false) => ({...renderer?.getDiagnostics(),...(picking?{pickTargets:renderer?.getPickTargets()}:{})}), configurable: true});
  renderer.setSpeed(Number(speed.value));
  controller = new CubeController(renderer,3);
  detachDrag = attachDrag(renderer,controller,() => {},(move,stamp,x,y)=>championMotion?championMotion.commit(move,stamp,x,y):controller!.applyMove(move,stamp));
  detachKeyboard = attachKeyboard(controller, () => {}, keySettings.getKeymap,
    move=>!document.querySelector<HTMLInputElement>('#view-keys')!.checked?viewMove(move,renderer!.getViewFaces()):move);
  renderer.onContextChange = available => {
    if(available) controller!.unlockInput('context'); else controller!.lockInput('context');
    contextMessage.hidden = available;
    contextMessage.textContent = available ? '' : t("Kết nối đồ họa tạm mất. Đang chờ trình duyệt khôi phục; bạn có thể tải lại trang nếu cần.");
    moveControls.disabled = !available;
  };
  renderer.onMoveAnimated = () => equippedEffects?.play();
  renderer.onIdle = () => {
    description.textContent = `Rubik ${sizeSelect.value}×${sizeSelect.value} · ${controller!.isSolved() ? t("Trạng thái đã giải") : t("Đang luyện tập")}`;
  };
  moveControls.disabled = false;
  loading.remove();
} catch (error) {
  loading.textContent = t("Không khởi tạo được WebGL. Hãy thử bật tăng tốc đồ họa hoặc dùng trình duyệt khác.");
  disableControls();
  console.error(error);
}
const updateAppearance=()=>{
  if (!renderer||timerUI?.isRunning()) return;
  equippedEffects?.dispose();
  equippedEffects=undefined;
  const detailed=controller?.size===3;
  champion=championStyles.get(controller!.size);
  container.classList.toggle('prometheus-gameplay',!champion&&detailed&&container.dataset.prometheusEquipped==='true');
  const key=champion?`${champion.size}:${champion.name}`:`normal:${detailed?'detailed':'plain'}:${JSON.stringify(skinLayout(detailed?equippedAppearance:undefined))}`;
  if(appearanceKey!==key){
    appearanceKey=key;
    championMotion?.dispose();championFrame?.dispose();championMotion=undefined;championFrame=undefined;
    renderer.setAppearance(champion?.options??skinLayout(detailed?equippedAppearance:undefined),controller!.cube.state);
    if(champion){
      championSize=champion.size;
      championFrame=mountChampionFrame(container,champion.name,champion.size);
      championMotion=mountChampionMotion(container,renderer,controller!,champion.sound,()=>!lowFx.checked,champion.size);
    }
  }
  if(champion)return;
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
    scrambleText.textContent = '';
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
  scrambleText.textContent = '';
};
const onScramble = (seed: string): void => {
  const moves = controller?.scramble(seed);
  if (!moves) return;
  timerUI?.scrambled(seed);
  scrambleText.textContent = moves.join(' ');
  description.textContent = `Rubik ${sizeSelect.value}×${sizeSelect.value}${t(" · Đã trộn")}`;
};
const onSpeed = (): void => { renderer?.setSpeed(Number(speed.value)); speedValue.value = `${speed.value} ms`; };
const onInstant = (): void => { renderer?.setInstant(instant.checked); };
speed.addEventListener('input', onSpeed);
instant.addEventListener('change', onInstant);


resetButton.addEventListener('click', onReset);
const account=await accountReady;
if(new URLSearchParams(location.search).get('panel')==='profile')document.querySelector<HTMLButtonElement>('#account-open')?.click();
const wallet=mountWallet(account);
const disposeDailyQuests=mountDailyQuests(account);
const weekly=mountWeeklyBoard();
const shop=mountShop(account,appearance=>{equippedAppearance=appearance;updateAppearance();},
  ()=>!timerUI?.isRunning(),()=>lowFx.checked,async(size,award)=>{
    const revision=(championRevisions.get(size)??0)+1;championRevisions.set(size,revision);
    if(!award){championStyles.delete(size);updateAppearance();return;}
    const style=await import('./champion-design.js');
    const design=await style.loadChampionDesign(size);
    if(revision!==championRevisions.get(size))return;
    championStyles.set(size,{options:style.championRendererOptions(design,'borderless',size),name:award.name??design.name,sound:design.interaction_fx.sound_file,size});
    updateAppearance();
  });
if(controller) timerUI=attachTimer(controller,()=>onScramble(newId()),account,
  solve=>{
    queueMicrotask(updateAppearance);
    if(solve.penalty!=='DNF'){
      if(solve.size===championSize&&!lowFx.checked)championFrame?.celebrate();
      equippedEffects?.play(true);
    }
  });
const onPageHide = (event: PageTransitionEvent): void => {
  if (!event.persisted) disposeCommunityChat();
  if (!event.persisted) { championMotion?.dispose(); championFrame?.dispose(); wallet.dispose(); disposeDailyQuests(); weekly.dispose(); shop.dispose(); equippedEffects?.dispose(); lowFx.removeEventListener('change',onLowFx); account?.dispose();clearInterval(viewLabelTimer); timerUI?.dispose(); detachDrag?.(); detachKeyboard?.(); keySettings.dispose(); controller?.dispose(); }
};
window.addEventListener('pagehide', onPageHide);
if (import.meta.hot) import.meta.hot.dispose(() => {
  disposeCommunityChat();
  championMotion?.dispose();championFrame?.dispose();
  wallet.dispose();
  disposeDailyQuests();
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
  speed.removeEventListener('input', onSpeed);
  instant.removeEventListener('change', onInstant);


  Reflect.deleteProperty(window, 'rubikDiagnostics');
  controller?.dispose();
});
