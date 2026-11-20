import './style.css';
import {CubeController} from '@rubik/controller';
import {CubeRenderer} from '@rubik/renderer';
import {championFaces,championRendererOptions,loadChampionDesign} from './champion-design.js';
import {mountChampionMotion} from './champion-motion.js';
import {attachDrag} from './drag.js';
import {attachKeyboard} from './keyboard.js';

const status=document.querySelector('#ice-status')!;
const viewport=document.querySelector<HTMLElement>('#viewport')!;
const speed=document.querySelector<HTMLSelectElement>('#ice-speed')!;
const moves=document.querySelector('#ice-moves')!;

void loadChampionDesign(2).then(design=>{
  const renderer=new CubeRenderer(viewport,championRendererOptions(design,'borderless',2));
  const controller=new CubeController(renderer,2);
  const motion=mountChampionMotion(viewport,renderer,controller,design.interaction_fx.sound_file,()=>true,2);
  const detachDrag=attachDrag(renderer,controller,()=>{},motion.commit);
  const detachKeys=attachKeyboard(controller,()=>{});
  const updateSpeed=()=>renderer.setSpeed(Number(speed.value));
  speed.addEventListener('change',updateSpeed);
  updateSpeed();
  for(const face of championFaces)for(const suffix of ['',"'",'2']){
    const move=face+suffix;
    const button=document.createElement('button');
    button.type='button';
    button.textContent=move;
    button.onclick=()=>controller.applyMove(move,performance.now());
    moves.append(button);
  }
  status.remove();
  window.addEventListener('pagehide',event=>{
    if(event.persisted)return;
    speed.removeEventListener('change',updateSpeed);
    detachDrag();detachKeys();motion.dispose();controller.dispose();
  });
}).catch(()=>{
  status.textContent='Không tải được Champion 2×2. Hãy tải lại trang.';
});
