import { newId } from './id.js';
import { SolveHistory, SolveTimer } from '@rubik/timer';
import { formatTime } from '@rubik/engine';
import type { CubeController } from '@rubik/controller';
import { attachHistory } from './history-controls.js';

export function attachTimer(controller: CubeController, newScramble: () => void) {
  const history=new SolveHistory();
  const historyUI=attachHistory(history,()=>controller.size);
  const timer = new SolveTimer({newId: () => newId(), now: () => new Date()});
  const element = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
  const readout=element('timer-readout'), phaseLabel=element('timer-phase'), message=element('timer-message');
  const start=element<HTMLButtonElement>('timer-start'), cancel=element<HTMLButtonElement>('timer-cancel');
  const dialog=element<HTMLDialogElement>('timer-cancel-dialog');
  let context: {size:number;seed:string;scrambleIndex:number} | undefined;
  let frame=0, wake=0, disposed=false;
  const listeners: (()=>void)[]=[];
  const on=(target:EventTarget,type:string,listener:EventListener,capture=false):void=>{
    target.addEventListener(type,listener,capture);listeners.push(()=>target.removeEventListener(type,listener,capture));
  };
  const running=()=>timer.phase==='inspecting'||timer.phase==='solving';
  const sync=():void=>{
    if(running())controller.unlockInput('timer');else controller.lockInput('timer');
    for(const node of document.querySelectorAll<HTMLInputElement|HTMLButtonElement|HTMLSelectElement|HTMLTextAreaElement>('#cube-size,#seed,#scramble,#reset,#move-buttons button,#algorithm-form textarea,#algorithm-form button,#key-settings-open')) node.disabled=running();
    start.disabled=running();cancel.disabled=!running();
    start.textContent=timer.phase==='finished'||!timer.armed?'Chuẩn bị scramble':'Bắt đầu inspection';
    phaseLabel.textContent={idle:timer.armed?'Sẵn sàng · Space để inspection':'Chờ scramble',inspecting:'Inspection · nước xoay lớp đầu tiên bắt đầu giải',solving:'Đang giải',finished:'Đã kết thúc'}[timer.phase];
  };
  const show=():void=>{
    const elapsed=timer.elapsed(performance.now());
    if(timer.phase==='inspecting')readout.textContent=elapsed<=15000?String(Math.max(0,Math.ceil((15000-elapsed)/1000))):'+2';
    else if(timer.phase==='finished'){
      const result=timer.result!,penalty=history.penalty(result.id)??result.penalty;
      readout.textContent=penalty==='DNF'?'DNF':formatTime(result.timeMs+(penalty==='+2'?2000:0))+(penalty==='+2'?' (+2)':'');
    }else readout.textContent=formatTime(elapsed);
  };
  const wakeUp=():void=>{
    timer.advance(performance.now());
    if(timer.phase==='inspecting')wake=window.setTimeout(wakeUp,Math.max(1,17001-timer.elapsed(performance.now())));
  };
  const refresh=():void=>{if(disposed)return;timer.advance(performance.now());show();frame=requestAnimationFrame(refresh);};
  const unchange=timer.onChange(()=>{if(timer.phase==='finished'){history.add(timer.result!);historyUI.render();}clearTimeout(wake);sync();show();});
  const unreplaced=controller.onStateReplaced(()=>{context=undefined;timer.disarm();sync();show();historyUI.render();});
  const unmove=controller.onMoveApplied(e=>timer.recordMove(e.move,e.stateAfter,e.t));
  controller.setMoveGate((move,stamp)=>timer.canApply(move,stamp));
  const begin=(stamp:number):void=>{
    if(controller.lockedBy.has('context')){message.textContent='Đang chờ khôi phục đồ họa.';return;}
    message.textContent='';
    if(timer.phase==='finished'){newScramble();return;}
    if(timer.phase!=='idle')return;
    if(!timer.armed){newScramble();return;}
    if(timer.startInspection(stamp)){
      (document.activeElement as HTMLElement|null)?.blur();
      wake=window.setTimeout(wakeUp,17001);
    }
  };
  const requestCancel=():void=>{if(running()&&!document.querySelector('dialog[open]'))dialog.showModal();};
  const editing=(event:Event)=>event.composedPath().some(t=>t instanceof HTMLElement&&(t.matches('input,textarea,select')||t.isContentEditable));
  on(window,'keydown',event=>{
    const e=event as KeyboardEvent;
    if(e.isComposing||editing(e)||e.ctrlKey||e.metaKey||e.altKey||document.querySelector('dialog[open]'))return;
    if(e.code==='Space'){e.preventDefault();if(!e.repeat){if(e.shiftKey && !running())newScramble();else if(!e.shiftKey)begin(e.timeStamp);}}
    else if(e.code==='Escape'&&!e.repeat&&running()){e.preventDefault();requestCancel();}
  },true);
  on(window,'keyup',event=>{const e=event as KeyboardEvent;if(e.code==='Space'&&!editing(e)&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&!document.querySelector('dialog[open]'))e.preventDefault();},true);
  on(start,'click',event=>begin(event.timeStamp));on(cancel,'click',requestCancel);
  on(element('timer-keep'),'click',()=>dialog.close());
  on(element('timer-confirm-cancel'),'click',()=>{
    timer.advance(performance.now());
    if(running()&&context){const old={...context};timer.cancel();controller.scramble(old.seed,old.scrambleIndex);context=old;timer.arm(old);sync();show();}
    dialog.close();
  });
  on(document,'visibilitychange',()=>{if(!document.hidden){timer.advance(performance.now());show();}});
  sync();frame=requestAnimationFrame(refresh);
  return {
    scrambled(seed:string):void {context={size:controller.size,seed,scrambleIndex:0};timer.arm(context);sync();show();},
    dispose():void {historyUI.dispose();disposed=true;cancelAnimationFrame(frame);clearTimeout(wake);for(const off of listeners)off();unchange();unreplaced();unmove();controller.setMoveGate(undefined);controller.unlockInput('timer');dialog.close();}
  };
}
