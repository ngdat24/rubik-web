import {t} from './i18n.js';
import { attachLeaderboard } from './leaderboard.js';
import { newId } from './id.js';
import { SolveHistory, SolveTimer } from '@rubik/timer';
import type {Solve} from '@rubik/timer';
import { formatTime } from '@rubik/engine';
import type { CubeController } from '@rubik/controller';
import { attachHistory } from './history-controls.js';
import {scopeHistory} from './history-storage.js';
import {attachCloudHistory} from './cloud-controls.js';
import type {CloudAccount} from './account.js';

export function attachTimer(controller: CubeController, newScramble: () => void|Promise<void>,account?:CloudAccount,onCompleted:(solve:Solve)=>void|Promise<void>=()=>{},autoPrepareNext:()=>boolean=()=>true) {
  scopeHistory(account?.id);
  const history=new SolveHistory();
  let cloud:ReturnType<typeof attachCloudHistory>|undefined;
  const historyUI=attachHistory(history,()=>controller.size,(entry,deleted)=>cloud?.mutated(entry,deleted));
  const leaderboard=import.meta.env.VITE_SUPABASE_URL&&import.meta.env.VITE_SUPABASE_ANON_KEY?(cloud=attachCloudHistory(account,history,historyUI)):attachLeaderboard();
  const timer = new SolveTimer({newId: () => newId(), now: () => new Date()});
  const element = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
  const readout=element('timer-readout'), phaseLabel=element('timer-phase'), message=element('timer-message');
  const start=element<HTMLButtonElement>('timer-start'), cancel=element<HTMLButtonElement>('timer-cancel');
  const dialog=element<HTMLDialogElement>('timer-cancel-dialog');
  let lastResult:Solve|undefined,preparingNext=false;
  let celebrating=false;
  let frame=0, wake=0, disposed=false;
  const listeners: (()=>void)[]=[];
  const on=(target:EventTarget,type:string,listener:EventListener,capture=false):void=>{
    target.addEventListener(type,listener,capture);listeners.push(()=>target.removeEventListener(type,listener,capture));
  };
  const running=()=>timer.phase==='inspecting'||timer.phase==='solving';
  const sync=():void=>{
    if(running())controller.unlockInput('timer');else controller.lockInput('timer');
    for(const node of document.querySelectorAll<HTMLButtonElement|HTMLSelectElement>('#cube-size,#reset,#key-settings-open')) node.disabled=running()||celebrating||preparingNext;
    start.disabled=running()||celebrating||preparingNext;cancel.disabled=!running();
    start.textContent=preparingNext?t('Đang chuẩn bị scramble…'):timer.phase==='finished'||!timer.armed?t("Chuẩn bị scramble"):t("Bắt đầu inspection");
    phaseLabel.textContent={idle:timer.armed?t("Sẵn sàng · Space để inspection"):t("Chờ scramble"),inspecting:t("Inspection · nước xoay lớp đầu tiên bắt đầu giải"),solving:t("Đang giải"),finished:t("Đã kết thúc")}[timer.phase];
  };
  const show=():void=>{
    const elapsed=timer.elapsed(performance.now());
    if(timer.phase==='inspecting')readout.textContent=elapsed<=15000?String(Math.max(0,Math.ceil((15000-elapsed)/1000))):'+2';
    else if(timer.phase==='finished'||(timer.phase==='idle'&&lastResult)){
      const result=timer.result??lastResult!,penalty=history.penalty(result.id)??result.penalty;
      readout.textContent=penalty==='DNF'?'DNF':formatTime(result.timeMs+(penalty==='+2'?2000:0))+(penalty==='+2'?' (+2)':'');
    }else readout.textContent=formatTime(elapsed);
  };
  const wakeUp=():void=>{
    timer.advance(performance.now());
    if(timer.phase==='inspecting')wake=window.setTimeout(wakeUp,Math.max(1,17001-timer.elapsed(performance.now())));
  };
  const refresh=():void=>{if(disposed)return;timer.advance(performance.now());show();frame=requestAnimationFrame(refresh);};
  const prepareNext=(result?:Solve):void=>{
    if(preparingNext||disposed)return;
    lastResult=result;preparingNext=true;
    sync();
    const finished=()=>{preparingNext=false;if(!disposed){sync();show();}};
    try{
      const pending=newScramble();
      if(pending)void pending.then(finished,error=>{if(!disposed)message.textContent=error instanceof Error?error.message:t('Không chuẩn bị được scramble.');finished();});
      else finished();
    }catch(error){finished();throw error;}
  };
  const unchange=timer.onChange(()=>{
    clearTimeout(wake);
    if(timer.phase==='finished'){
      const result=timer.result!;
      let completion:void|Promise<void>=undefined;
      if(history.add(result)){
        leaderboard.completed(result);
        completion=onCompleted(result);
      }
      historyUI.changed();
      if(result.penalty!=='DNF'){
        if(completion){
          celebrating=true;sync();show();
          const finished=()=>{
            celebrating=false;
            if(!disposed&&timer.phase==='finished'&&timer.result?.id===result.id){
              if(autoPrepareNext())prepareNext(result);else {sync();show();}
            }
          };
          void completion.then(finished,finished);
        }else if(autoPrepareNext())prepareNext(result);else {sync();show();}
        return;
      }
    }
    sync();show();
  });
  const unreplaced=controller.onStateReplaced(()=>{if(!preparingNext)lastResult=undefined;timer.disarm();sync();show();historyUI.render();});
  const unmove=controller.onMoveApplied(e=>timer.recordMove(e.move,e.stateAfter,e.t));
  controller.setMoveGate((move,stamp)=>timer.canApply(move,stamp));
  const begin=(stamp:number):void=>{
    if(celebrating||preparingNext)return;
    if(controller.lockedBy.has('context')){message.textContent=t("Đang chờ khôi phục đồ họa.");return;}
    message.textContent='';
    if(timer.phase==='finished'){prepareNext(timer.result);return;}
    if(timer.phase!=='idle')return;
    if(!timer.armed){prepareNext();return;}
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
    if(e.code==='Space'){e.preventDefault();if(!e.repeat&&!e.shiftKey)begin(e.timeStamp);}
    else if(e.code==='Escape'&&!e.repeat&&running()){e.preventDefault();requestCancel();}
  },true);
  on(window,'keyup',event=>{const e=event as KeyboardEvent;if(e.code==='Space'&&!editing(e)&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&!document.querySelector('dialog[open]'))e.preventDefault();},true);
  on(start,'click',event=>begin(event.timeStamp));on(cancel,'click',requestCancel);
  on(element('timer-keep'),'click',()=>dialog.close());
  on(element('timer-confirm-cancel'),'click',()=>{
    timer.advance(performance.now());
    if(running()){timer.cancel();prepareNext();}
    dialog.close();
  });
  on(document,'visibilitychange',()=>{if(!document.hidden){timer.advance(performance.now());show();}});
  sync();frame=requestAnimationFrame(refresh);
  return {
    isRunning:()=>running()||celebrating||preparingNext,
    scrambled(seed:string):void {timer.arm({size:controller.size,seed,scrambleIndex:0});sync();show();},
    dispose():void {leaderboard.dispose();historyUI.dispose();disposed=true;cancelAnimationFrame(frame);clearTimeout(wake);for(const off of listeners)off();unchange();unreplaced();unmove();controller.setMoveGate(undefined);controller.unlockInput('timer');dialog.close();}
  };
}
