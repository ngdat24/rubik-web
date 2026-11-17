import {championAssets,championSizeAssets} from './champion-design.js';
import type {ChampionSize} from './champion-design.js';
import './champion-frame.css';

export function mountChampionFrame(viewport:HTMLElement,name:string,size:ChampionSize=3) {
  const frame=document.createElement('div');
  frame.className='champion-frame';
  const signature=document.createElement('img'),logo=document.createElement('img');
  logo.src=championAssets+'frame_logo.png';
  logo.alt='Rubik Lab';
  logo.className='champion-frame__logo';
  signature.src=championSizeAssets(size)+'frame_signature.png';
  signature.alt='Chữ ký Champion';
  signature.className='champion-frame__signature';
  const title=document.createElement('p');
  title.className='champion-frame__title';
  title.textContent=name;
  for(const side of ['tl','tr','bl','br']){
    const corner=document.createElement('img');
    corner.className='champion-frame__corner champion-frame__corner--'+side;
    corner.src=championAssets+'frame_corner.png';
    corner.alt='';
    frame.append(corner);
  }
  for(const position of ['top-left','top-right','left-top','left-bottom','right-top','right-bottom','bottom']){
    const rail=document.createElement('span');
    rail.className='champion-frame__rail champion-frame__rail--'+position;
    rail.setAttribute('aria-hidden','true');
    frame.append(rail);
  }
  const shower=document.createElement('div');
  shower.className='champion-frame__shower';
  shower.setAttribute('aria-hidden','true');
  frame.append(logo,title,signature,shower);
  viewport.classList.add('champion-viewport');
  viewport.append(frame);
  let clearTimer=0;
  function clear() {
    window.clearTimeout(clearTimer);
    shower.replaceChildren();
  }
  return {
    show(visible:boolean){
      frame.hidden=!visible;
      viewport.classList.toggle('champion-viewport',visible);
      if(!visible)clear();
    },
    celebrate(){
      if(frame.hidden||window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
      clear();
      const leaves=document.createDocumentFragment();
      for(let i=0;i<40;i++){
        const leaf=document.createElement('i');
        leaf.className='champion-frame__leaf';
        leaf.style.setProperty('--left',((i*37.53+3)%100)+'%');
        leaf.style.setProperty('--size',(5+(i*17%12))+'px');
        leaf.style.setProperty('--drift',((i*43%151)-75)+'px');
        leaf.style.setProperty('--twist',((i%2?1:-1)*(300+i*23))+'deg');
        leaf.style.setProperty('--delay',(i*73%700)+'ms');
        leaf.style.setProperty('--duration',(1470+(i*611%950))+'ms');
        leaves.append(leaf);
      }
      shower.append(leaves);
      clearTimer=window.setTimeout(clear,3200);
    },
    dispose(){clear();frame.remove();viewport.classList.remove('champion-viewport');}
  };
}
