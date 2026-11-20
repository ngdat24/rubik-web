import {CubeController} from '@rubik/controller';
import {scrambleAt} from '@rubik/engine';
import {attachKeyboard} from './keyboard.js';
import {prometheus as design} from './prometheus-config.js';
import {PrometheusStudy} from './prometheus-study.js';
import './prometheus-preview.css';
const el=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
const stage=el('stage'),status=el('status');
stage.classList.add('prometheus-gameplay');
const previewName=document.createElement('div');previewName.className='prometheus-personal-name';previewName.textContent=design.names.vi;stage.append(previewName);
const display=new PrometheusStudy(stage,el('performance'),undefined,el('quality-note')),controller=new CubeController(display,3);
display.onBloomChange=active=>{
  if(active)controller.lockInput('solve-bloom');else controller.unlockInput('solve-bloom');
  for(const button of document.querySelectorAll<HTMLButtonElement>('#core,#mix,#solve-fx,#moves button'))button.disabled=active;
  status.textContent=active?'Rubik đang xòe quanh tâm lõi rồi tự khép lại…':'Đã khép nguyên khối · sẵn sàng';
};
// Ultra only: no quality selector or automatic downgrade.
display.setQuality('ultra');
const offDrag=display.bindDrag(controller);
let wasSolved=true;
const offMove=controller.onMoveApplied(({move})=>{display.feedback(move);const solved=controller.isSolved();display.setSolvedAppearance(solved);if(solved&&!wasSolved)display.celebrate();wasSolved=solved;if(!controller.lockedBy.has('solve-bloom'))status.textContent='Đang xoay '+move;});
const offKeys=attachKeyboard(controller,move=>{if(!controller.lockedBy.has('solve-bloom'))status.textContent='Đang xoay '+move;});
for(const move of ['U','R','F','D','L','B']){
  const button=document.createElement('button');button.textContent=move;button.onclick=()=>controller.applyMove(move,performance.now());el('moves').append(button);
}
el('reset').onclick=()=>{controller.reset();status.textContent='Đã về nguyên khối';};
el('mix').onclick=()=>{if(display.isAnimating)return;controller.moves(scrambleAt(String(Date.now()),3,0),performance.now());status.textContent='Đang trộn thử';};
el('reverse').onclick=()=>display.view('back');el('front').onclick=()=>display.view('white');
let coreOpen=false;
const coreButton=el<HTMLButtonElement>('core');
const offReplace=controller.onStateReplaced(()=>{wasSolved=controller.isSolved();display.setSolvedAppearance(wasSolved,true);coreOpen=false;controller.unlockInput('core-study');coreButton.textContent='Mở lớp xem lõi';coreButton.setAttribute('aria-pressed','false');});
coreButton.onclick=()=>{
  if(coreOpen){display.closeCore();coreOpen=false;controller.unlockInput('core-study');}
  else if(display.openCore()){coreOpen=true;controller.lockInput('core-study');}
  coreButton.textContent=coreOpen?'Đóng lớp trên':'Mở lớp xem lõi';coreButton.setAttribute('aria-pressed',String(coreOpen));
  status.textContent=coreOpen?'Tách lớp để xem ruột đá quý, lồng đồng và tim lửa · đóng lớp để tiếp tục xoay':'Sẵn sàng';
};
el('loading').remove();
if(import.meta.env.DEV)Object.defineProperty(window,'prometheusStudy',{value:{controller,display},configurable:true});
el('solve-fx').onclick=()=>{if(coreOpen)coreButton.click();display.celebrate();};
const reveal=el<HTMLDialogElement>('reveal');
el('reveal-open').onclick=()=>{reveal.showModal();reveal.classList.remove('ignite');void reveal.offsetWidth;reveal.classList.add('ignite');display.revealSound();};
el('reveal-close').onclick=()=>reveal.close();
let soundOn=true;el('sound').onclick=()=>{soundOn=!soundOn;display.soundEnabled(soundOn);el('sound').textContent='Âm thanh: '+(soundOn?'Bật':'Tắt');el('sound').setAttribute('aria-pressed',String(soundOn));};
const dispose=()=>{offKeys();offDrag();offMove();offReplace();controller.dispose();};
window.addEventListener('pagehide',event=>{if(!event.persisted)dispose();});
if(import.meta.hot)import.meta.hot.dispose(dispose);
