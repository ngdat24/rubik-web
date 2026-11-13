import { formatTime } from '@rubik/engine';
import { validateHistoryBackup } from '@rubik/timer';
import type { Solve } from '@rubik/timer';

interface Player {id:string;token:string;name:string}
interface Pending {solve:Solve;playerId:string|null;rejected?:string}
class ApiError extends Error {constructor(message:string,readonly status:number){super(message);}}
export function attachLeaderboard(){
  if(!document.querySelector('meta[name="rubik-lan"]')){
    document.querySelector('#leaderboard-message')!.textContent='Chạy npm.cmd run lan trên máy chủ để mở bảng xếp hạng chung.';
    document.querySelector<HTMLButtonElement>('#player-edit')!.disabled=true;
    return {completed(_solve:Solve){},dispose(){}};
  }
  const dialog=document.querySelector<HTMLDialogElement>('#player-dialog')!;
  const form=document.querySelector<HTMLFormElement>('#player-form')!;
  const input=document.querySelector<HTMLInputElement>('#player-name')!;
  const message=document.querySelector<HTMLElement>('#leaderboard-message')!;
  const error=document.querySelector<HTMLElement>('#player-error')!;
  const label=document.querySelector<HTMLElement>('#player-label')!;
  const button=document.querySelector<HTMLButtonElement>('#player-edit')!;
  const size=document.querySelector<HTMLSelectElement>('#leaderboard-size')!;
  const tbody=document.querySelector<HTMLTableSectionElement>('#leaderboard-rows')!;
  let player:Player|undefined,pending:Pending[]=[],busy=false,disposed=false,available=false;
  const controller=new AbortController();
  try{const raw=JSON.parse(localStorage.getItem('rubik.lan.player')??'null');if(raw&&typeof raw.id==='string'&&typeof raw.token==='string'&&typeof raw.name==='string')player=raw;}catch{message.textContent='Không đọc được hồ sơ hoặc hàng đợi trên thiết bị.';}
  const prefix='rubik.lan.pending.';
  const store=(item:Pending)=>{try{localStorage.setItem(prefix+item.solve.id,JSON.stringify(item));return true;}catch{message.textContent='Không lưu được hàng đợi gửi; hãy giữ trang mở để thử lại.';return false;}};
  const loadPending=()=>{
    try{for(let i=0;i<localStorage.length;i++){
      const key=localStorage.key(i);if(!key?.startsWith(prefix))continue;
      const raw=JSON.parse(localStorage.getItem(key)!);
      if(raw.playerId!==null&&typeof raw.playerId!=='string')continue;
      const solve=validateHistoryBackup({version:1,entries:[{solve:raw.solve,penaltyOverride:null}]}).entries[0]!.solve;
      if(!pending.some(item=>item.solve.id===solve.id))pending.push({solve,playerId:raw.playerId,...(typeof raw.rejected==='string'?{rejected:raw.rejected}:{})});
    }}catch{message.textContent='Không đọc được một phần hàng đợi trên thiết bị.';}
  };
  const api=async(path:string,body?:unknown)=>{
    const response=await fetch('/api/'+path,{method:body===undefined?'GET':'POST',headers:{...(body===undefined?{}:{'Content-Type':'application/json'}),...(player?{Authorization:'Bearer '+player.token}:{})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.any([controller.signal,AbortSignal.timeout(8000)])});
    if(!response.ok){let text='Server LAN chưa sẵn sàng.';try{text=(await response.json()).error??text;}catch{/* A development server has no LAN API. */}throw new ApiError(text,response.status);}
    return response.json();
  };
  const render=async()=>{
    const requested=size.value;
    const data=await api('leaderboard?size='+requested);available=true;
    if(disposed||requested!==size.value)return;
    tbody.replaceChildren();
    for(const [index,row] of data.rows.entries()){
      const tr=document.createElement('tr');
      for(const value of [String(index+1),row.name,formatTime(row.timeMs)]){const td=document.createElement('td');td.textContent=value;tr.append(td);}tbody.append(tr);
    }
    if(!data.rows.length){const row=tbody.insertRow(),cell=row.insertCell();cell.colSpan=3;cell.textContent='Chưa có kết quả.';}
  };
  const open=()=>{input.value=player?.name??'';error.textContent='';if(!document.querySelector('dialog[open]')){dialog.showModal();input.focus();}};
  const sync=async()=>{
    if(busy||disposed)return;busy=true;
    try{
      loadPending();await render();
      if(player){const current=await api('player') as Player;player=current;label.textContent=current.name;}
      else {message.textContent='Đặt tên để tự gửi kết quả lên phòng.';return;}
      for(const item of [...pending]){
        if(item.rejected||(item.playerId&&item.playerId!==player.id))continue;
        try{await api('solves',{solve:item.solve});}
        catch(e){if(e instanceof ApiError&&[400,413].includes(e.status)){item.rejected=e.message;store(item);continue;}message.textContent=`Kết quả đang chờ gửi: ${e instanceof Error?e.message:'Lỗi kết nối'}`;return;}
        pending=pending.filter(p=>p.solve.id!==item.solve.id);try{localStorage.removeItem(prefix+item.solve.id);}catch{message.textContent='Đã gửi, nhưng không dọn được hàng đợi trên thiết bị.';return;}
      }
      await render();const rejected=pending.find(item=>item.rejected);message.textContent=rejected?`Một kết quả chỉ giữ local: ${rejected.rejected}`:'Đã đồng bộ · top 10 lượt giải.';
    }catch{if(!disposed)message.textContent='Chưa kết nối server LAN · kết quả mới sẽ chờ gửi lại.';}
    finally{busy=false;}
  };
  const submit=async(event:SubmitEvent)=>{
    event.preventDefault();const submitButton=form.querySelector<HTMLButtonElement>('button[type=submit]')!;submitButton.disabled=true;
    try{
      const value=await api('player',{name:input.value}) as Player;
      player=value;label.textContent=value.name;
      try{localStorage.setItem('rubik.lan.player',JSON.stringify(value));}catch{error.textContent='Đã lưu tên trên server nhưng không nhớ được hồ sơ trên thiết bị này.';return;}
      loadPending();pending=pending.map(item=>item.playerId===null?{...item,playerId:value.id}:item);for(const item of pending)store(item);dialog.close();void sync();
    }catch(e){error.textContent=e instanceof Error?e.message:'Không lưu được tên.';}
    finally{submitButton.disabled=false;}
  };
  const change=()=>{void sync();};
  const close=()=>dialog.close();
  form.addEventListener('submit',submit);button.addEventListener('click',open);size.addEventListener('change',change);document.querySelector('#player-close')!.addEventListener('click',close);window.addEventListener('online',change);
  label.textContent=player?.name??'Chưa đặt tên';
  void sync().then(()=>{if(available&&!player&&!disposed)open();});
  const interval=window.setInterval(change,5000);
  return {
    completed(solve:Solve){if(![2,3].includes(solve.size)||pending.some(p=>p.solve.id===solve.id))return;const item={solve,playerId:player?.id??null};pending.push(item);store(item);void sync();},
    dispose(){disposed=true;controller.abort();clearInterval(interval);form.removeEventListener('submit',submit);button.removeEventListener('click',open);size.removeEventListener('change',change);document.querySelector('#player-close')!.removeEventListener('click',close);window.removeEventListener('online',change);dialog.close();}
  };
}
