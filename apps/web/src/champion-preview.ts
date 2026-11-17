import {language,t} from './i18n.js';
import {CubeController} from '@rubik/controller';
import {CubeRenderer} from '@rubik/renderer';
import {attachDrag} from './drag.js';
import {attachKeyboard} from './keyboard.js';
import {skinPalette} from './skin-effects.js';
import {championClaimKey,championSizeAssets,championFaces as faces,
  championRendererOptions,loadChampionDesign,readChampionClaim as readClaim} from './champion-design.js';
import type {ChampionClaim as Claim,ChampionSize,ChampionVariant as Variant} from './champion-design.js';
import {mountChampionMotion} from './champion-motion.js';
import {browserAccount} from './account.js';
import {championAwards} from './champion-account.js';
import {newId} from './id.js';
import './champion-preview.css';

const modes:Record<Variant,{title:string; description:string}> = {
  borderless:{title:t('Không viền'),description:t('Màu phủ sát mép, chỉ vàng mảnh ôm khe và lõi nhựa vàng trong. Tâm trắng có chữ ký, tâm vàng có logo ĐS lửa.')},
  classic:{title:t('Viền đen'),description:t('Viền carbon đen, chỉ vàng sát mép và lõi nhựa vàng trong. Tâm vàng có logo ĐS lửa dập nổi.')}
};
const el=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
const params=new URLSearchParams(location.search);
const size:ChampionSize=params.get('size')==='2'?2:3;
const assetRoot=championSizeAssets(size);
const storageKey=championClaimKey(size);
const sizeSelect=el<HTMLSelectElement>('preview-size');
sizeSelect.value=String(size);
sizeSelect.onchange=()=>{params.set('size',sizeSelect.value);location.search=params.toString();};
const stage=el('stage');
const scan=el<HTMLImageElement>('scan');
const scanLink=el<HTMLAnchorElement>('scan-link');
const title=el<HTMLInputElement>('title');
const form=el<HTMLFormElement>('claim');
const confirm=el<HTMLDialogElement>('confirm');
const core=el<HTMLButtonElement>('core');
const camera=el<HTMLButtonElement>('camera');
const localDemo=import.meta.env.DEV;
const account=localDemo?undefined:await browserAccount().catch(()=>undefined);
let canClaim=localDemo;
let claim:Claim|undefined=localDemo?readClaim(size):undefined;
let accountError='';
if(!localDemo){
  try {
    const award=account?(await championAwards(account)).find(row=>row.size===size):undefined;
    canClaim=Boolean(award);
    if(award?.variant)claim={variant:award.variant,name:award.name};
  } catch(error){accountError=error instanceof Error?t(error.message):t('Không tải được quyền nhận Champion.');}
}
let selected:Variant=claim?.variant ?? 'borderless';
let pending:Claim|undefined;
let renderer:CubeRenderer|undefined;
let controller:CubeController|undefined;
let detach:()=>void=()=>{};
let coreOpen=false;
let reversed=false;
let motion:ReturnType<typeof mountChampionMotion>|undefined;

const design=await loadChampionDesign(size);
title.placeholder=t(design.name);
const palette=skinPalette(design);
for(const [index,face] of faces.entries()){
  const li=document.createElement('li'),swatch=document.createElement('i');
  swatch.style.backgroundColor='#'+palette[index]!.toString(16).padStart(6,'0');
  li.append(swatch,face);
  el('palette').append(li);
}

function unlockCore() {
  if(coreOpen)renderer?.endDrag();
  coreOpen=false;
  controller?.unlockInput('champion-core');
  core.setAttribute('aria-pressed','false');
  core.textContent=t('Hé xem nam châm');
}
function mount() {
  stage.classList.remove('turn');
  detach();
  if(controller)controller.dispose();else renderer?.dispose();
  renderer=new CubeRenderer(stage,championRendererOptions(design,selected,size));
  renderer.setSpeed(120);
  renderer.resetCamera();
  renderer.zoomBy(.92);
  controller=new CubeController(renderer,size);
  motion=mountChampionMotion(stage,renderer,controller,design.interaction_fx.sound_file,undefined,size);
  const offDrag=attachDrag(renderer,controller,()=>{},motion.commit);
  const offKeys=attachKeyboard(controller,()=>{});
  detach=()=>{offDrag();offKeys();motion?.dispose();};
  coreOpen=false;
  unlockCore();
  reversed=false;
  camera.textContent=t('Góc D/B/L');
  el('variant-name').textContent=modes[selected].title;
  el('variant-copy').textContent=size===2?t('Chữ ký trên một ô góc trắng. Logo ĐS lửa ở một ô góc vàng.'):modes[selected].description;
  for(const mode of ['classic','borderless'] as const)el(mode).setAttribute('aria-pressed',String(mode===selected));
  scan.src=scanLink.href=assetRoot+'scan_'+selected+'.png';
  const practiceLink=el<HTMLAnchorElement>('practice-link');
  practiceLink.href='/?lang='+language+'&champion='+(claim?.variant??selected)+'&championSize='+size;
  practiceLink.hidden=!localDemo&&!claim;
  scan.alt=t('Scan sáu mặt của Apex Chrono phiên bản ')+modes[selected].title.toLowerCase();
}
for(const mode of ['classic','borderless'] as const)el(mode).addEventListener('click',()=>{
  if(selected===mode)return;
  unlockCore();
  selected=mode;
  mount();
});
el('turn').addEventListener('click',()=>{
  unlockCore();
  controller?.applyMove('R',performance.now());
});
core.onclick=()=>{
  if(!renderer||!controller||renderer.pendingMoveCount)return;
  if(coreOpen){unlockCore();return;}
  stage.classList.remove('turn');
  renderer.beginDrag('U');
  renderer.updateDrag(Math.PI/4);
  controller.lockInput('champion-core');
  coreOpen=true;
  core.setAttribute('aria-pressed','true');
  core.textContent=t('Đóng lớp trên');
};
camera.onclick=()=>{
  unlockCore();
  reversed=!reversed;
  renderer?.setCameraView(reversed?'dbl':'ufr');
  renderer?.zoomBy(.92);
  camera.textContent=reversed?t('Góc U/F/R'):t('Góc D/B/L');
};
el('audio').addEventListener('click',()=>motion?.play());

function updateClaim() {
  if(!claim){
    title.disabled=!canClaim;
    form.querySelector('button')!.disabled=!canClaim;
    el('claim-note').textContent=accountError||(localDemo?t('Demo local: lựa chọn chỉ lưu trên trình duyệt này.'):canClaim
      ?t('Bạn được cấp quyền nhận. Kiểu viền cố định; đổi tên sau khi nhận tốn 500 CB/lần.')
      :t('Bạn có thể xem thử; hồ sơ này chưa được chủ web cấp quyền nhận skin.'));
    return;
  }
  title.value=claim.name;
  title.disabled=true;
  form.querySelector('button')!.disabled=true;
  el('claim-note').textContent=t('Đã chốt ')+claim.name+t(' · ')+modes[claim.variant].title+'.';
  el<HTMLFormElement>('rename').hidden=localDemo;
}
form.addEventListener('submit',event=>{
  event.preventDefault();
  if(claim||!canClaim)return;
  pending={variant:selected,name:title.value.trim() || design.name};
  el('confirm-copy').textContent=t('Bạn sẽ lưu ')+pending.name+t(' với kiểu ')+modes[pending.variant].title.toLowerCase()+t('. Kiểu viền không thể đổi. Đổi tên sau khi nhận tốn 500 CB/lần.');
  confirm.returnValue='';
  confirm.showModal();
});
confirm.addEventListener('close',async()=>{
  if(confirm.returnValue!=='claim'||!pending||claim)return;
  try {
    canClaim=false;updateClaim();
    if(localDemo){
      const existing=readClaim(size);
      if(!existing)localStorage.setItem(storageKey,JSON.stringify(pending));
      claim=existing??pending;
    }else{
      if(!account)throw new Error(t('Chưa có phiên hồ sơ.'));
      const award=(await championAwards(account,{...pending,size})).find(row=>row.size===size);
      if(!award?.variant)throw new Error(t('Chưa xác nhận được lựa chọn trên server.'));
      claim={variant:award.variant,name:award.name};
    }
    selected=claim.variant;
    mount();
    updateClaim();
  } catch(error){canClaim=true;updateClaim();el('claim-note').textContent=error instanceof Error?t(error.message):t('Không lưu được lựa chọn. Hãy thử lại.');}
});
mount();
updateClaim();
let pendingRename:{action:'rename';size:ChampionSize;name:string;requestId:string}|undefined;
el<HTMLFormElement>('rename').addEventListener('submit',async event=>{
  event.preventDefault();
  if(!account||!claim)return;
  const input=el<HTMLInputElement>('rename-title'),button=el<HTMLFormElement>('rename').querySelector('button')!;
  pendingRename??={action:'rename',size,name:input.value.trim(),requestId:newId()};
  input.disabled=true;button.disabled=true;
  try{
    const award=(await championAwards(account,pendingRename)).find(row=>row.size===size);
    if(!award?.variant)throw new Error(t('Không xác nhận được tên mới.'));
    claim={name:award.name,variant:award.variant};pendingRename=undefined;
    updateClaim();mount();input.value='';
    el('rename-note').textContent=t('Đã đổi tên và trừ 500 CB.');
  }catch(error){
    el('rename-note').textContent=(error instanceof Error?t(error.message):t('Không đổi được tên.'))+t(' Có thể thử lại cùng yêu cầu.');
    // Keep the same request ID across ambiguous network failures.
    if(error instanceof Error&&/500 CB|phải khác|không hợp lệ|different|Invalid/.test(error.message))pendingRename=undefined;
  }finally{input.disabled=Boolean(pendingRename);button.disabled=false;}
});
window.addEventListener('pagehide',event=>{
  if(event.persisted)return;
  detach();controller?.dispose();account?.dispose();
});
