import type {CubeController,MoveApplied} from '@rubik/controller';
import type {CubeRenderer} from '@rubik/renderer';
import {championSizeAssets} from './champion-design.js';
import type {ChampionSize} from './champion-design.js';
import './champion-motion.css';

export function mountChampionMotion(stage:HTMLElement,renderer:CubeRenderer,controller:CubeController,soundFile:string,enabled=()=>true,size:ChampionSize=3) {
  const audio=size===2?undefined:new Audio(soundFile);
  let sword:AudioContext|undefined;
  if(audio)audio.preload='auto';
  let dragDirection:{x:number;y:number}|undefined;
  stage.classList.add('champion-motion');
  if(size===2)stage.style.setProperty('--champion-effect','url("'+championSizeAssets(2)+'champion_dragon.png")');
  const clear=()=>stage.classList.remove('turn');
  const play=()=>{
    if(audio){audio.currentTime=0;void audio.play().catch(()=>{});return;}
    sword??=new AudioContext();
    const context=sword;
    void context.resume().then(()=>{
      const time=context.currentTime;
      const buffer=context.createBuffer(1,Math.ceil(context.sampleRate*.15),context.sampleRate);
      const noise=buffer.getChannelData(0);
      for(let i=0;i<noise.length;i++)noise[i]=Math.random()*2-1;
      const rush=context.createBufferSource(),filter=context.createBiquadFilter(),gain=context.createGain();
      rush.buffer=buffer;filter.type='bandpass';filter.Q.value=.85;
      filter.frequency.setValueAtTime(750,time);
      filter.frequency.exponentialRampToValueAtTime(4200,time+.03);
      filter.frequency.exponentialRampToValueAtTime(1300,time+.145);
      gain.gain.setValueAtTime(.001,time);gain.gain.exponentialRampToValueAtTime(.28,time+.025);
      gain.gain.exponentialRampToValueAtTime(.0001,time+.15);
      rush.connect(filter).connect(gain).connect(context.destination);rush.start(time);
      for(const [hz,level,decay] of [[930,.06,.18],[1739,.045,.24],[2480,.038,.21],[3770,.024,.17]]){
        const wave=context.createOscillator(),ring=context.createGain();
        wave.frequency.setValueAtTime(hz!,time+.02);
        wave.frequency.exponentialRampToValueAtTime(hz!*.90,time+.02+decay!);
        ring.gain.setValueAtTime(level!,time+.02);ring.gain.exponentialRampToValueAtTime(.0001,time+.02+decay!);
        wave.connect(ring).connect(context.destination);wave.start(time+.02);wave.stop(time+.02+decay!);
      }
    }).catch(()=>{});
  };
  const feedback=({move}:MoveApplied)=>{
    if(!enabled())return;
    play();
    const direction=dragDirection??renderer.getTurnScreenDirection(move);
    stage.style.setProperty('--cut-rotation',(Math.atan2(direction.y,direction.x)*180/Math.PI+(size===2?-148:24))+'deg');
    clear();
    void stage.offsetWidth;
    stage.classList.add('turn');
  };
  const off=controller.onMoveApplied(feedback);
  return {
    clear,play,
    commit(move:string,stamp:number,x:number,y:number){
      dragDirection={x,y};
      try{return controller.applyMove(move,stamp);}
      finally{dragDirection=undefined;}
    },
    dispose(){
      off();audio?.pause();void sword?.close().catch(()=>{});clear();
      stage.classList.remove('champion-motion');
      stage.style.removeProperty('--cut-rotation');
      stage.style.removeProperty('--champion-effect');
    }
  };
}
