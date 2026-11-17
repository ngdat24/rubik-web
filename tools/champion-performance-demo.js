import {CubeRenderer} from '/packages/renderer/src/index.ts';
import {CubeController} from '/packages/controller/src/index.ts';
import {Cube} from '/packages/engine/src/index.ts';
import {attachDrag} from '/apps/web/src/drag.ts';
import {attachKeyboard} from '/apps/web/src/keyboard.ts';
import {championRendererOptions,loadChampionDesign} from '/apps/web/src/champion-design.ts';
import {mountChampionFrame} from '/apps/web/src/champion-frame.ts';
import {mountChampionMotion} from '/apps/web/src/champion-motion.ts';

const el=id=>document.getElementById(id),viewport=el('viewport');
let renderer,controller,off=()=>{},motion,frame,history=[],optimized=true,peek=false,serial=0;
let previousFrames=0,previousTime=performance.now();
const display={setSize:n=>renderer.setSize(n),setState:s=>renderer.setState(s),
  enqueueMove:(m,s)=>renderer.enqueueMove(m,s),enqueueMoves:m=>renderer.enqueueMoves(m),
  get isAnimating(){return renderer.isAnimating;},dispose:()=>renderer.dispose()};
function closePeek(){if(peek){renderer.endDrag();controller.unlockInput('demo-peek');peek=false;}el('peek').textContent='Mở lớp 45°';}
async function rebuild(reset=false){
  const ticket=++serial,size=Number(el('size').value),design=await loadChampionDesign(size);
  if(ticket!==serial)return;
  const restorePeek=peek&&!reset;
  closePeek();
  const camera=renderer?{position:renderer.camera.position.clone(),up:renderer.camera.up.clone()}:undefined;
  renderer?.clearQueue();off();motion?.dispose();frame?.dispose();renderer?.dispose();
  renderer=new CubeRenderer(viewport,{...championRendererOptions(design,el('variant').value,size),optimize:optimized,measurePerformance:true});
  renderer.setSpeed(120);
  if(!controller)controller=new CubeController(display,size);
  if(reset){history=[];controller.setSize(size);}
  if(camera){renderer.camera.position.copy(camera.position);renderer.camera.up.copy(camera.up);renderer.camera.lookAt(0,0,0);renderer.controls.update();}
  // Replay accepted visual snapshots so atlas tile identity also survives A/B switching.
  const cube=new Cube(size);
  for(const move of history){cube.applyMove(move);renderer.enqueueMove(move,cube.state);}
  renderer.clearQueue();
  frame=mountChampionFrame(viewport,'Champion · Thử hiệu năng',size);
  motion=mountChampionMotion(viewport,renderer,controller,design.interaction_fx.sound_file,()=>el('effects').checked,size);
  const drag=attachDrag(renderer,controller,()=>{},motion.commit),keys=attachKeyboard(controller,()=>{});
  off=()=>{drag();keys();};
  previousFrames=0;previousTime=performance.now();
  for(const [id,value] of [['original',false],['optimized',true]])el(id).setAttribute('aria-pressed',String(optimized===value));
  el('mode-status').textContent=optimized?'Bản tối ưu · gộp chi tiết, dùng chung texture, nghỉ khi đứng yên':'Bản hiện tại · vẽ liên tục';
  window.demo={renderer,controller,rebuild};viewport.focus();
  if(restorePeek)openPeek();
}
function openPeek(){renderer.clearQueue();renderer.beginDrag('U');renderer.updateDrag(Math.PI/4);controller.lockInput('demo-peek');peek=true;el('peek').textContent='Đóng lớp';}
await rebuild();
controller.onMoveApplied(({move})=>history.push(move));
for(const move of ['R',"R'",'U',"U'",'F',"F'",'L','D','B']){
  const button=document.createElement('button');button.textContent=move;
  button.onclick=()=>{closePeek();controller.applyMove(move,performance.now());viewport.focus();};el('moves').append(button);
}
for(const [id,value] of [['original',false],['optimized',true]])el(id).onclick=async()=>{if(optimized===value)return;optimized=value;await rebuild();};
el('size').onchange=()=>rebuild(true);el('variant').onchange=()=>rebuild();
el('peek').onclick=()=>{if(peek){closePeek();return;}openPeek();};
el('reset').onclick=()=>{closePeek();history=[];controller.reset();};
el('camera').onclick=()=>renderer.resetCamera();
let next=0;const sequence=['R','U',"R'","U'",'F',"F'"];
setInterval(()=>{if(el('auto').checked&&!peek&&!renderer.pendingMoveCount)controller.applyMove(sequence[next++%sequence.length],performance.now());},450);
setInterval(()=>{
  const stats=renderer.getDiagnostics(),now=performance.now(),rate=(stats.renderedFrames-previousFrames)*1000/(now-previousTime);
  previousFrames=stats.renderedFrames;previousTime=now;
  el('stats').textContent=`Lệnh vẽ/khung: ${stats.drawCalls} · Tam giác: ${stats.triangles.toLocaleString('vi')} · Texture GPU: ${renderer.webgl.info.memory.textures} · Số lần vẽ/s: ${Math.max(0,rate).toFixed(0)}`;
},500);
window.addEventListener('pagehide',()=>{off();motion?.dispose();frame?.dispose();controller?.dispose();});
