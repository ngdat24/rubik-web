import {formatTime} from '@rubik/engine';

export function mountTimeLimitBoard(){
  const buttons=[...document.querySelectorAll<HTMLButtonElement>('[data-time-mode]')];
  const rows=document.querySelector<HTMLTableSectionElement>('#time-limit-rows')!;
  const status=document.querySelector<HTMLElement>('#time-limit-board-status')!;
  let mode='fullSolve',disposed=false,requestId=0;
  const abort=new AbortController();
  const render=async(fresh=false)=>{
    if(disposed||document.hidden)return;const id=++requestId;
    try{
      const response=await fetch('/api/time-limit-leaderboard?mode='+mode+(fresh?'&fresh=1':''),{cache:fresh?'no-store':'default',signal:AbortSignal.any([abort.signal,AbortSignal.timeout(10000)])});
      const data=await response.json();if(!response.ok)throw new Error(data.error??'Chưa tải được bảng xếp hạng.');
      if(disposed||id!==requestId)return;
      rows.replaceChildren(...data.rows.map((item:{name:string;score:number;lastEndT:number},i:number)=>{
        const row=document.createElement('tr');
        for(const text of [String(i+1),item.name,String(item.score),formatTime(item.lastEndT)]){const cell=document.createElement('td');cell.textContent=text;row.append(cell);}return row;
      }));
      if(!data.rows.length){const cell=rows.insertRow().insertCell();cell.colSpan=4;cell.textContent='Chưa có lượt hoàn thành.';}
      status.textContent='Top 10 lượt chơi · cập nhật khoảng 15 giây.';
    }catch(error){if(!disposed&&id===requestId)status.textContent=error instanceof Error?error.message:'Chưa kết nối được server.';}
  };
  const select=(value:string)=>{mode=value;rows.replaceChildren();status.textContent='Đang tải bảng…';for(const button of buttons)button.setAttribute('aria-pressed',String(button.dataset.timeMode===mode));void render();};
  const listeners=buttons.map(button=>{const click=()=>select(button.dataset.timeMode!);button.addEventListener('click',click);return()=>button.removeEventListener('click',click);});
  const visible=()=>{if(!document.hidden)void render();};document.addEventListener('visibilitychange',visible);
  const interval=window.setInterval(()=>{void render();},15000);select(mode);
  return {select,refresh:()=>{void render(true);},dispose(){disposed=true;abort.abort();clearInterval(interval);for(const off of listeners)off();document.removeEventListener('visibilitychange',visible);}};
}
