import { formatTime } from '@rubik/engine';
import type { Penalty } from '@rubik/engine';
import { SolveHistory } from '@rubik/timer';

export function attachHistory(history: SolveHistory, getSize: ()=>number) {
  const list=document.querySelector<HTMLOListElement>('#solve-history')!;
  const stats=document.querySelector<HTMLElement>('#solve-stats')!;
  const status=document.querySelector<HTMLElement>('#history-message')!;
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
    stats.textContent=Object.entries(history.statistics(getSize())).map(([kind,value])=>`${kind}: ${value.display}`).join(' · ');
    document.querySelector('#history-empty')!.textContent=entries.length?'':`Chưa có lần giải ${getSize()}×${getSize()}.`;
  };
  const click=(event:MouseEvent):void=>{
    const button=(event.target as Element).closest<HTMLButtonElement>('button[data-action]');
    const id=button?.closest<HTMLLIElement>('li')?.dataset.solveId;if(!button||!id)return;
    const action=button.dataset.action!;
    if(action==='delete')history.delete(id);else history.edit(id,action==='original'?null:action as Penalty);
    render();status.textContent=action==='delete'?'Đã xóa lần giải.':'Đã cập nhật phạt và thống kê; bản ghi gốc được giữ nguyên.';
  };
  list.addEventListener('click',click);render();
  return {render,dispose:()=>list.removeEventListener('click',click)};
}
