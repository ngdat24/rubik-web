import type {CubeController} from '@rubik/controller';
import type {CubeRenderer} from '@rubik/renderer';
import {PrometheusStudy} from './prometheus-study.js';
import {Cube,isSolved} from '@rubik/engine';

export function mountPrometheus(host:HTMLElement,renderer:CubeRenderer,controller:CubeController,lowFx:()=>boolean){
  const layer=document.createElement('div');
  layer.className='prometheus-render-layer';
  layer.setAttribute('aria-hidden','true');
  host.append(layer);
  let display:PrometheusStudy;
  try{
    display=new PrometheusStudy(layer,undefined,camera=>renderer.copyCameraTo(camera));
    display.shouldDraw=()=>{
      const modal=document.querySelector('dialog:modal');
      return !document.hidden&&(!modal||modal.contains(host));
    };
    display.turnDuration=doubleTurn=>renderer.turnDuration(doubleTurn);
    display.setState(controller.cube.state);
    display.setLightweight(!controller.isSolved(),lowFx()||!controller.isSolved()?'lite':'ultra');
    display.soundEnabled(!lowFx());
  }catch(error){layer.remove();throw error;}
  renderer.canvas.classList.add('prometheus-input-canvas');
  renderer.setRenderingEnabled(false);
  let completeCelebration:(()=>void)|undefined;
  let solved=controller.isSolved();
  display.setSolvedAppearance(solved,true);
  let coreOpen=false;
  let preparing=false,disposed=false;
  void display.ready.then(()=>{if(!disposed)layer.dataset.prometheusReady='true';});
  display.onBloomChange=active=>{
    if(active)controller.lockInput('prometheus-bloom');
    else {
      controller.unlockInput('prometheus-bloom');
      completeCelebration?.();completeCelebration=undefined;
    }
  };
  const replace=controller.onStateReplaced(()=>{
    if(controller.size!==3)return;
    if(preparing)return;
    coreOpen=false;
    controller.unlockInput('prometheus-core');
    display.setState(controller.cube.state);
    solved=controller.isSolved();
    display.setLightweight(!solved,lowFx()||!solved?'lite':'ultra');
    display.setSolvedAppearance(solved,true);
    completeCelebration?.();completeCelebration=undefined;
  });
  const move=controller.onMoveApplied(event=>{
    if(controller.size!==3)return;
    display.enqueueMove(event.move,event.stateAfter);
    if(!lowFx())display.feedback(event.move);
    const nextSolved=isSolved(event.stateAfter,3);
    if(nextSolved)display.setLightweight(false,lowFx()?'lite':'ultra');
    display.setSolvedAppearance(nextSolved,lowFx());
    if(nextSolved&&!solved&&!lowFx())display.celebrate();
    solved=nextSolved;
  });
  return {
    async prepareScramble(seed:string){
      if(preparing||disposed)return;
      preparing=true;controller.lockInput('prometheus-scramble');
      try{
        await display.ready;
        if(disposed)return;
        const started=performance.now();
        const moves=controller.scramble(seed),cube=new Cube(3),initial=cube.state.slice();
        const snapshots=moves.map(move=>({move,stateAfter:cube.applyMove(move).state.slice()}));
        coreOpen=false;controller.unlockInput('prometheus-core');
        const finished=await display.animateScramble(initial,snapshots,started,lowFx()?'lite':'balanced');
        if(!finished||disposed)return;
        solved=false;
        return moves;
      }finally{preparing=false;controller.unlockInput('prometheus-scramble');}
    },
    finishSolve(){
      if(lowFx())return;
      completeCelebration?.();
      return new Promise<void>(resolve=>{completeCelebration=resolve;});
    },
    toggleCore(){
      if(coreOpen){
        display.closeCore();
        coreOpen=false;
        controller.unlockInput('prometheus-core');
      }else if(display.openCore()){
        coreOpen=true;
        controller.lockInput('prometheus-core');
      }
      return coreOpen;
    },
    setQuality(){
      display.setQuality(lowFx()||!solved?'lite':'ultra');
      display.soundEnabled(!lowFx());
    },
    dispose(){
      disposed=true;
      move();replace();display.dispose();layer.remove();
      controller.unlockInput('prometheus-bloom');
      controller.unlockInput('prometheus-core');
      renderer.canvas.classList.remove('prometheus-input-canvas');
      renderer.setRenderingEnabled(true);
      completeCelebration?.();completeCelebration=undefined;
    }
  };
}
