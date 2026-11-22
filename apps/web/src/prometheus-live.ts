import type {CubeController} from '@rubik/controller';
import type {CubeRenderer} from '@rubik/renderer';
import {PrometheusStudy} from './prometheus-study.js';
import {isSolved} from '@rubik/engine';

export function mountPrometheus(host:HTMLElement,renderer:CubeRenderer,controller:CubeController,lowFx:()=>boolean){
  const layer=document.createElement('div');
  layer.className='prometheus-render-layer';
  layer.setAttribute('aria-hidden','true');
  host.append(layer);
  let display:PrometheusStudy;
  try{
    display=new PrometheusStudy(layer,undefined,camera=>renderer.copyCameraTo(camera));
    display.keepOriginalAppearance=true;
    display.shouldDraw=()=>{
      const modal=document.querySelector('dialog:modal');
      return !document.hidden&&(!modal||modal.contains(host));
    };
    display.turnDuration=doubleTurn=>renderer.turnDuration(doubleTurn);
    display.setState(controller.cube.state);
    display.setQuality(lowFx()?'lite':'ultra');
    display.soundEnabled(!lowFx());
  }catch(error){layer.remove();throw error;}
  renderer.canvas.classList.add('prometheus-input-canvas');
  renderer.setRenderingEnabled(false);
  let completeCelebration:(()=>void)|undefined;
  let solved=controller.isSolved();
  display.setSolvedAppearance(solved,true);
  let coreOpen=false;
  display.onBloomChange=active=>{
    if(active)controller.lockInput('prometheus-bloom');
    else {
      controller.unlockInput('prometheus-bloom');
      completeCelebration?.();completeCelebration=undefined;
    }
  };
  const replace=controller.onStateReplaced(()=>{
    if(controller.size!==3)return;
    coreOpen=false;
    controller.unlockInput('prometheus-core');
    display.setState(controller.cube.state);
    solved=controller.isSolved();
    display.setSolvedAppearance(solved,true);
    completeCelebration?.();completeCelebration=undefined;
  });
  const move=controller.onMoveApplied(event=>{
    if(controller.size!==3)return;
    display.enqueueMove(event.move,event.stateAfter);
    if(!lowFx())display.feedback(event.move);
    const nextSolved=isSolved(event.stateAfter,3);
    display.setSolvedAppearance(nextSolved);
    if(nextSolved&&!solved&&!lowFx())display.celebrate();
    solved=nextSolved;
  });
  return {
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
      display.setQuality(lowFx()?'lite':'ultra');
      display.soundEnabled(!lowFx());
    },
    dispose(){
      move();replace();display.dispose();layer.remove();
      controller.unlockInput('prometheus-bloom');
      controller.unlockInput('prometheus-core');
      renderer.canvas.classList.remove('prometheus-input-canvas');
      renderer.setRenderingEnabled(true);
      completeCelebration?.();completeCelebration=undefined;
    }
  };
}
