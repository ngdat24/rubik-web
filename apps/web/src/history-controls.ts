import {t} from './i18n.js';
import { loadHistory, saveHistory } from './history-storage.js';
import { formatTime } from '@rubik/engine';
import type { Penalty } from '@rubik/engine';
import { SolveHistory, validateHistoryBackup } from '@rubik/timer';
import type {HistoryEntry} from '@rubik/timer';

export function attachHistory(history: SolveHistory, getSize: ()=>number, onMutation:(entry:HistoryEntry,deleted:boolean)=>void=()=>{}) {
  const list=document.querySelector<HTMLOListElement>('#solve-history')!;
  const stats=document.querySelector<HTMLElement>('#solve-stats')!;
  const status=document.querySelector<HTMLElement>('#history-message')!;
  const storageStatus=document.querySelector<HTMLElement>('#history-storage-status')!;
  let ready=false,disposed=false,canPersist=true;let writes=Promise.resolve();
  const persist=():void=>{
    if(!ready||disposed||!canPersist)return;const snapshot={version:1 as const,entries:history.entries()};
    writes=writes.then(async()=>{await saveHistory(validateHistoryBackup(snapshot));if(!disposed)storageStatus.textContent=t("Đã lưu lịch sử trên trình duyệt này.");}).catch(()=>{if(!disposed)storageStatus.textContent=t("Không lưu được lịch sử trên trình duyệt.");});
  };
  const render=():void=>{
    const entries=history.list(getSize()).slice(0, 5);list.replaceChildren();
    for(const entry of entries){
      const row=document.createElement('li');row.dataset.solveId=entry.solve.id;
      const penalty=entry.penaltyOverride??entry.solve.penalty;
      const text=document.createElement('span');text.className='solve-time';
      text.textContent=(penalty==='DNF'?'DNF':formatTime(entry.solve.timeMs+(penalty==='+2'?2000:0)))+`${t(" · phạt ")}${penalty}${t(" · gốc ")}${entry.solve.penalty}`+(entry.penaltyOverride!==null?t(" · đã chỉnh"):'');
      row.append(text);
      for(const [action,label] of [['none',t("Không phạt")],['+2','+2'],['DNF','DNF'],['original',t("Phạt gốc")],['delete',t("Xóa")]] as const){
        const button=document.createElement('button');button.type='button';button.dataset.action=action;button.textContent=label;
        if(['none','+2','DNF'].includes(action))button.setAttribute('aria-pressed',String(penalty===action));
        if(action==='original')button.disabled=entry.penaltyOverride===null;
        row.append(button);
      }
      list.append(row);
    }
    stats.replaceChildren(...Object.entries(history.statistics(getSize())).map(([kind,value])=>{
      const cell=document.createElement('span');
      cell.textContent=`${kind}: ${value.display}`;
      return cell;
    }));
    document.querySelector('#history-empty')!.textContent=entries.length?'':`${t("Chưa có lần giải ")}${getSize()}${t("×")}${getSize()}.`;
  };
  const click=(event:MouseEvent):void=>{
    const button=(event.target as Element).closest<HTMLButtonElement>('button[data-action]');
    const id=button?.closest<HTMLLIElement>('li')?.dataset.solveId;if(!button||!id)return;
    const action=button.dataset.action!;
    const original=history.entries().find(entry=>entry.solve.id===id)!;
    if(action==='delete')history.delete(id);else history.edit(id,action==='original'?null:action as Penalty);
    onMutation(action==='delete'?original:history.entries().find(entry=>entry.solve.id===id)!,action==='delete');
    render();persist();status.textContent=action==='delete'?t("Đã xóa lần giải."):t("Đã cập nhật phạt và thống kê; bản ghi gốc được giữ nguyên.");
  };
  list.addEventListener('click',click);render();
  const loaded=loadHistory().then(value=>{
    if(disposed)return;const unsaved=history.entries().length>0;if(value!==undefined)history.merge(validateHistoryBackup(value).entries);
    ready=true;render();storageStatus.textContent=t("Đã tải lịch sử trên trình duyệt này.");if(unsaved)persist();
  }).catch(()=>{if(!disposed){ready=true;canPersist=false;storageStatus.textContent=t("Không đọc được lịch sử đã lưu; phiên hiện tại vẫn dùng được.");}});
  return {loaded,render,changed:()=>{render();persist();},dispose:()=>{disposed=true;list.removeEventListener('click',click);}};
}
