import type {CubeController,MoveApplied} from '@rubik/controller';
import type {CubeRenderer} from '@rubik/renderer';
import {mountChampionIceTurn} from './champion-ice-turn.js';
import type {ChampionSize} from './champion-design.js';
import './champion-motion.css';

export function mountChampionMotion(stage:HTMLElement,renderer:CubeRenderer,controller:CubeController,soundFile:string,enabled=()=>true,size:ChampionSize=3) {
  if(size===2){
    const dispose=mountChampionIceTurn(renderer,enabled);
    return {dispose,commit:(move:string,stamp:number,_x:number,_y:number)=>controller.applyMove(move,stamp)};
  }
  const audio=new Audio(soundFile);
  audio.preload='auto';
  let dragDirection:{x:number;y:number}|undefined;
  stage.classList.add('champion-motion');
  const clear=()=>stage.classList.remove('turn');
  const play=()=>{
    audio.currentTime=0;
    void audio.play().catch(()=>{});
  };
  const feedback=({move}:MoveApplied)=>{
    if(!enabled())return;
    play();
    const direction=dragDirection??renderer.getTurnScreenDirection(move);
    stage.style.setProperty('--cut-rotation',(Math.atan2(direction.y,direction.x)*180/Math.PI+24)+'deg');
    clear();
    void stage.offsetWidth;
    stage.classList.add('turn');
  };
  const off=controller.onMoveApplied(feedback);
  return {
    commit(move:string,stamp:number,x:number,y:number){
      dragDirection={x,y};
      try{return controller.applyMove(move,stamp);}
      finally{dragDirection=undefined;}
    },
    dispose(){
      off();audio.pause();clear();
      stage.classList.remove('champion-motion');
      stage.style.removeProperty('--cut-rotation');
    }
  };
}
