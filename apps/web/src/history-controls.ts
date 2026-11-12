import { loadHistory, saveHistory } from './history-storage.js';
import { formatTime } from '@rubik/engine';
import type { Penalty } from '@rubik/engine';
import { SolveHistory, parseHistoryBackup, validateHistoryBackup, historyCsv } from '@rubik/timer';
import type {HistoryEntry} from '@rubik/timer';

export function attachHistory(history: SolveHistory, getSize: ()=>number, onMutation:(entry:HistoryEntry,deleted:boolean)=>void=()=>{}) {
  const list=document.querySelector<HTMLOListElement>('#solve-history')!;
  const stats=document.querySelector<HTMLElement>('#solve-stats')!;
  const status=document.querySelector<HTMLElement>('#history-message')!;
  const storageStatus=document.querySelector<HTMLElement>('#history-storage-status')!;
  let ready=false,disposed=false,canPersist=true;let writes=Promise.resolve();
  const persist=():void=>{
    if(!ready||disposed||!canPersist)return;const snapshot={version:1 as const,entries:history.entries()};
    writes=writes.then(async()=>{await saveHistory(validateHistoryBackup(snapshot));if(!disposed)storageStatus.textContent='Đã lưu lịch sử trên trình duyệt này.';}).catch(()=>{if(!disposed)storageStatus.textContent='Không lưu được lịch sử; hãy backup JSON trước khi đóng trang.';});
  };
  const render=():void=>{
    const entries=history.list(getSize());list.replaceChildren();
    for(const entry of entries){
      const row=document.createElement('li');row.dataset.solveId=entry.solve.id;
      const penalty=entry.penaltyOverride??entry.solve.penalty;
      const text=document.createElement('span');text.className='solve-time';
      text.textContent=(penalty==='DNF'?'DNF':formatTime(entry.solve.timeMs+(penalty==='+2'?2000:0)))+` · phạt ${penalty} · gốc ${entry.solve.penalty}`+(entry.penaltyOverride!==null?' · đã chỉnh':'');
      row.append(text);
      for(const [action,label] of [['none','Không phạt'],['+2','+2'],['DNF','DNF'],['original','Phạt gốc'],['delete','Xóa']] as const){
        const button=document.createElement('button');button.type='button';button.dataset.action=action;button.textContent=label;
        if(['none','+2','DNF'].includes(action))button.setAttribute('aria-pressed',String(penalty===action));
        if(action==='original')button.disabled=entry.penaltyOverride===null;
        row.append(button);
      }
      list.append(row);
    }
    stats.replaceChildren();
    for(const [kind,value] of Object.entries(history.statistics(getSize()))){const cell=document.createElement('span');cell.textContent=`${kind}: ${value.display}`;stats.append(cell);}
    document.querySelector('#history-empty')!.textContent=entries.length?'':`Chưa có lần giải ${getSize()}×${getSize()}.`;
  };
  const click=(event:MouseEvent):void=>{
    const button=(event.target as Element).closest<HTMLButtonElement>('button[data-action]');
    const id=button?.closest<HTMLLIElement>('li')?.dataset.solveId;if(!button||!id)return;
    const action=button.dataset.action!;
    const original=history.entries().find(entry=>entry.solve.id===id)!;
    if(action==='delete')history.delete(id);else history.edit(id,action==='original'?null:action as Penalty);
    onMutation(action==='delete'?original:history.entries().find(entry=>entry.solve.id===id)!,action==='delete');
    render();persist();status.textContent=action==='delete'?'Đã xóa lần giải.':'Đã cập nhật phạt và thống kê; bản ghi gốc được giữ nguyên.';
  };
  const download=(text:string,type:string,name:string):void=>{
    const url=URL.createObjectURL(new Blob([text],{type})),link=document.createElement('a');link.href=url;link.download=name;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);
  };
  const exportJson=()=>download(JSON.stringify({version:1,entries:history.entries()},null,2),'application/json','rubik-history.json');
  const exportCsv=()=>download(historyCsv(history.entries()),'text/csv;charset=utf-8','rubik-history.csv');
  const input=document.querySelector<HTMLInputElement>('#history-import')!;
  const importFile=():void=>{
    const file=input.files?.[0];input.value='';if(!file)return;
    if(!ready){status.textContent='Hãy chờ tải lịch sử xong trước khi nhập.';return;}
    if(file.size>10_000_000){status.textContent='Backup quá lớn (tối đa 10 MB).';return;}
    void file.text().then(text=>{if(disposed)return;const backup=parseHistoryBackup(text),current=history.entries(),ids=new Set(current.map(e=>e.solve.id)),fresh=backup.entries.filter(e=>!ids.has(e.solve.id));validateHistoryBackup({version:1,entries:[...current,...fresh]});const added=history.merge(fresh);render();persist();status.textContent=`Đã nhập ${added} lần giải; ID đã có được giữ nguyên, không ghi đè phạt chỉnh.`;}).catch(()=>{if(!disposed)status.textContent='Backup không hợp lệ hoặc không đọc được; lịch sử hiện tại được giữ nguyên.';});
  };
  const jsonButton=document.querySelector('#history-export')!,csvButton=document.querySelector('#history-csv')!;
  jsonButton.addEventListener('click',exportJson);csvButton.addEventListener('click',exportCsv);input.addEventListener('change',importFile);
  list.addEventListener('click',click);render();
  const loaded=loadHistory().then(value=>{
    if(disposed)return;const unsaved=history.entries().length>0;if(value!==undefined)history.merge(validateHistoryBackup(value).entries);
    ready=true;render();storageStatus.textContent='Đã tải lịch sử trên trình duyệt này.';if(unsaved)persist();
  }).catch(()=>{if(!disposed){ready=true;canPersist=false;storageStatus.textContent='Không đọc được lịch sử đã lưu; phiên hiện tại vẫn dùng được. Hãy giữ backup JSON.';}});
  return {loaded,render,changed:()=>{render();persist();},dispose:()=>{disposed=true;list.removeEventListener('click',click);jsonButton.removeEventListener('click',exportJson);csvButton.removeEventListener('click',exportCsv);input.removeEventListener('change',importFile);}};
}
