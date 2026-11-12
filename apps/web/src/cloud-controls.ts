import {formatTime} from '@rubik/engine';
import {validateHistoryBackup} from '@rubik/timer';
import type {HistoryEntry,Solve,SolveHistory} from '@rubik/timer';
import type {CloudAccount} from './account.js';
import {newId} from './id.js';

interface Row {id:string;solve:Solve;penalty_override:HistoryEntry['penaltyOverride'];deleted:boolean;revision:number}
interface Pending {entry:HistoryEntry;deleted:boolean;ranked:boolean;revision:number|null;nonce:string;error?:string;conflict?:boolean}
class ApiError extends Error {constructor(message:string,readonly status:number){super(message);}}

export function attachCloudHistory(account:CloudAccount|undefined,history:SolveHistory,ui:{loaded:Promise<void>;changed:()=>void}){
  const message=document.querySelector<HTMLElement>('#leaderboard-message')!,status=document.querySelector<HTMLElement>('#cloud-message')!;
  const label=document.querySelector<HTMLElement>('#player-label')!,size=document.querySelector<HTMLSelectElement>('#leaderboard-size')!;
  const tbody=document.querySelector<HTMLTableSectionElement>('#leaderboard-rows')!,edit=document.querySelector<HTMLButtonElement>('#player-edit')!;
  const dialog=document.querySelector<HTMLDialogElement>('#player-dialog')!,form=document.querySelector<HTMLFormElement>('#player-form')!;
  const name=document.querySelector<HTMLInputElement>('#player-name')!,nameError=document.querySelector<HTMLElement>('#player-error')!;
  const syncButton=document.querySelector<HTMLButtonElement>('#cloud-sync')!,importButton=document.querySelector<HTMLButtonElement>('#cloud-import')!;
  const resolveButton=document.querySelector<HTMLButtonElement>('#cloud-use-server')!;
  const abort=new AbortController(),pending=new Map<string,Pending>(),revisions=new Map<string,number>();
  const prefix='rubik.cloud.pending.'+account?.id+'.',revisionPrefix='rubik.cloud.revision.'+account?.id+'.';
  let disposed=false,busy=false,profileName='',storageError=false,prompted=false;
  const store=(id:string,item:Pending)=>{pending.set(id,item);try{localStorage.setItem(prefix+id,JSON.stringify(item));}catch{storageError=true;status.textContent='Không lưu được hàng đợi; giữ trang mở để gửi lại.';}};
  const load=()=>{
    if(!account)return;
    try{for(let i=0;i<localStorage.length;i++){
      const key=localStorage.key(i);if(!key?.startsWith(prefix))continue;
      const raw=JSON.parse(localStorage.getItem(key)!);
      const entry=validateHistoryBackup({version:1,entries:[raw.entry]}).entries[0]!;
      if(typeof raw.deleted!=='boolean'||typeof raw.ranked!=='boolean'||typeof raw.nonce!=='string'||(raw.revision!==null&&(!Number.isSafeInteger(raw.revision)||raw.revision<1)))continue;
      if(!pending.has(entry.solve.id))pending.set(entry.solve.id,{...raw,entry});
    }}catch{storageError=true;status.textContent='Không đọc được hàng đợi; có thể xuất backup trước khi tải lại.';}
  };
  const revision=(id:string)=>{if(revisions.has(id))return revisions.get(id)!;try{const value=Number(localStorage.getItem(revisionPrefix+id));return Number.isSafeInteger(value)&&value>0?value:null;}catch{return null;}};
  const remember=(row:Row)=>{revisions.set(row.id,row.revision);try{localStorage.setItem(revisionPrefix+row.id,String(row.revision));}catch{/* A missing revision causes a safe conflict, never an unguarded overwrite. */}};
  const api=async(path:string,body?:unknown)=>{
    const token=account&&!path.startsWith('leaderboard?')?await account.token():undefined;
    const response=await fetch('/api/'+path,{method:body===undefined?'GET':'POST',headers:{...(body===undefined?{}:{'Content-Type':'application/json'}),...(token?{Authorization:'Bearer '+token}:{})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.any([abort.signal,AbortSignal.timeout(15000)])});
    if(!response.ok){let text='Chưa kết nối được server.';try{text=(await response.json()).error??text;}catch{/* Preserve pending data on a non-JSON gateway response. */}throw new ApiError(text,response.status);}return response.json();
  };
  const board=async()=>{
    const requested=size.value,{rows}=await api('leaderboard?size='+requested);if(disposed||requested!==size.value)return;
    tbody.replaceChildren();for(const [i,row] of rows.entries()){const tr=document.createElement('tr');for(const text of [String(i+1),row.name,formatTime(row.timeMs)]){const td=document.createElement('td');td.textContent=text;tr.append(td);}tbody.append(tr);}
    if(!rows.length){const td=tbody.insertRow().insertCell();td.colSpan=3;td.textContent='Chưa có kết quả.';}
    message.textContent='Thành tích tốt nhất mỗi người · 2×2 / 3×3.';
  };
  const pull=async()=>{
    const downloaded:Row[]=[];
    for(let offset=0;offset<=10000;offset+=500){
      const {rows}:{rows:Row[]}=await api('solves?offset='+offset);if(disposed)return;
      downloaded.push(...rows);if(rows.length<500)break;
    }
    validateHistoryBackup({version:1,entries:downloaded.map(row=>({solve:row.solve,penaltyOverride:row.penalty_override}))});
    const local=new Map(history.entries().map(entry=>[entry.solve.id,entry]));let changed=false;
    for(const row of downloaded){
        remember(row);if(pending.has(row.id))continue;
        const old=local.get(row.id);
        if(row.deleted){if(history.delete(row.id))changed=true;continue;}
        if(!old){history.merge([{solve:row.solve,penaltyOverride:row.penalty_override}]);changed=true;}
        else if(JSON.stringify(old.solve)!==JSON.stringify(row.solve)){
          // This is a non-pending copy of a server-owned ID; take the canonical original.
          history.delete(row.id);history.merge([{solve:row.solve,penaltyOverride:row.penalty_override}]);changed=true;
        }else if(old.penaltyOverride!==row.penalty_override){history.edit(row.id,row.penalty_override);changed=true;}
    }
    if(changed)ui.changed();
  };
  const sync=async()=>{
    if(busy||disposed)return;busy=true;syncButton.disabled=true;
    try{
      await ui.loaded;await board();if(!account){status.textContent='Đăng nhập để đồng bộ lịch sử riêng giữa các thiết bị.';return;}
      load();const profile=await api('player');if(disposed)return;
      profileName=profile.name??'';label.textContent=profileName||'Chưa đặt tên';if(!profileName&&!prompted&&!document.querySelector('dialog[open]')){prompted=true;showName();}
      for(const [id,item] of [...pending]){
        if(item.error)continue;
        try{
          const {row}:{row:Row}=await api('solves',{solve:item.entry.solve,penaltyOverride:item.entry.penaltyOverride,deleted:item.deleted,ranked:item.ranked,revision:item.revision});remember(row);
          // A second edit may arrive while a request is in flight.
          let latest=pending.get(id);
          try{
            const raw=JSON.parse(localStorage.getItem(prefix+id)??'null');
            if(raw&&raw.nonce!==item.nonce&&latest?.nonce===item.nonce){
              const entry=validateHistoryBackup({version:1,entries:[raw.entry]}).entries[0]!;
              latest={...raw,entry};pending.set(id,latest!);
            }
          }catch{storageError=true;}
          if(latest?.nonce!==item.nonce){if(latest)store(id,{...latest,revision:row.revision});continue;}
          pending.delete(id);try{localStorage.removeItem(prefix+id);}catch{storageError=true;}
        }catch(error){if(error instanceof ApiError&&[400,409,413].includes(error.status)){store(id,{...item,error:error.message,conflict:error.status===409});continue;}throw error;}
      }
      await pull();await board();
      const failed=[...pending.values()].find(item=>item.error);resolveButton.hidden=![...pending.values()].some(item=>item.conflict);
      status.textContent=failed?`Một thay đổi chưa đồng bộ: ${failed.error}`:storageError?'Đã gửi; lưu hàng đợi trên thiết bị gặp lỗi.':'Đã đồng bộ lịch sử tài khoản.';
    }catch(error){if(!disposed)status.textContent=error instanceof Error?error.message:'Chưa kết nối được server; kết quả vẫn ở thiết bị.';}
    finally{busy=false;if(!disposed)syncButton.disabled=!account;}
  };
  const queue=(entry:HistoryEntry,deleted:boolean,ranked=false)=>{
    if(!account||disposed)return;load();const old=pending.get(entry.solve.id);
    store(entry.solve.id,{entry,deleted,ranked:old?.ranked??ranked,revision:old?old.revision:revision(entry.solve.id),nonce:newId()});void sync();
  };
  const showName=()=>{if(!account){document.querySelector<HTMLButtonElement>('#account-open')!.click();return;}name.value=profileName;nameError.textContent='';if(!document.querySelector('dialog[open]'))dialog.showModal();};
  const submitName=async(event:SubmitEvent)=>{event.preventDefault();const button=form.querySelector<HTMLButtonElement>('button[type=submit]')!;button.disabled=true;try{const profile=await api('player',{name:name.value});profileName=profile.name;label.textContent=profile.name;dialog.close();void sync();}catch(error){nameError.textContent=error instanceof Error?error.message:'Không lưu được tên.';}finally{button.disabled=false;}};
  const change=()=>{void sync();};
  const importHistory=()=>{if(!account)return;for(const entry of history.entries())if(revision(entry.solve.id)===null)queue(entry,false,false);void sync();};
  const useServer=()=>{for(const [id,item] of pending)if(item.conflict){pending.delete(id);try{localStorage.removeItem(prefix+id);}catch{storageError=true;}}resolveButton.hidden=true;void sync();};
  const close=()=>dialog.close();
  label.textContent=account?'Đang tải tên…':'Khách';edit.textContent=account?'Đổi tên':'Đăng nhập';syncButton.hidden=importButton.hidden=!account;
  edit.addEventListener('click',showName);form.addEventListener('submit',submitName);document.querySelector('#player-close')!.addEventListener('click',close);size.addEventListener('change',change);syncButton.addEventListener('click',change);importButton.addEventListener('click',importHistory);resolveButton.addEventListener('click',useServer);window.addEventListener('online',change);
  void sync();const interval=window.setInterval(change,30000);
  return {completed(solve:Solve){queue({solve,penaltyOverride:null},false,true);},mutated:queue,dispose(){disposed=true;abort.abort();clearInterval(interval);edit.removeEventListener('click',showName);form.removeEventListener('submit',submitName);document.querySelector('#player-close')!.removeEventListener('click',close);size.removeEventListener('change',change);syncButton.removeEventListener('click',change);importButton.removeEventListener('click',importHistory);resolveButton.removeEventListener('click',useServer);window.removeEventListener('online',change);dialog.close();}};
}
