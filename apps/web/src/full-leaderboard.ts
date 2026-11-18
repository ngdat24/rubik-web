import {browserAccount} from './account.js';
import {mountWallet} from './wallet.js';
import {t} from './i18n.js';
import {formatTime} from '@rubik/engine';
import './style.css';
import './full-leaderboard.css';
const rows=document.querySelector<HTMLTableSectionElement>('#board-rows')!;
const status=document.querySelector<HTMLElement>('#board-status')!;
const caption=document.querySelector<HTMLElement>('#board-caption')!;
const buttons=document.querySelectorAll<HTMLButtonElement>('[data-size]');
let size=3,active:AbortController|undefined;
async function load(){
 active?.abort();const request=new AbortController();active=request;
 status.textContent=t('Đang tải bảng xếp hạng…');
 try{
  const response=await fetch('/api/leaderboard?size='+size+'&limit=1000',{signal:AbortSignal.any([request.signal,AbortSignal.timeout(15000)])});
  if(!response.ok)throw new Error('Server unavailable');
  const data=await response.json();if(!Array.isArray(data.rows))throw new Error('Invalid leaderboard');
  const fragment=document.createDocumentFragment();
  for(const [index,row] of data.rows.slice(0,1000).entries()){
   if(typeof row.name!=='string'||!Number.isSafeInteger(row.timeMs)||row.timeMs<0)throw new Error('Invalid row');
   const tr=document.createElement('tr');
   for(const value of [String(index+1),row.name,formatTime(row.timeMs)]){const td=document.createElement('td');td.textContent=value;tr.append(td);}
   if(row.nameplate==='neon'||row.nameplate==='gold')tr.cells[1]!.dataset.nameplate=row.nameplate;
   fragment.append(tr);
  }
  if(active!==request)return;
  rows.replaceChildren(fragment);
  status.textContent=data.rows.length?t('Số lượt giải hợp lệ trên bảng: ')+Math.min(data.rows.length,1000)+' / 1.000':t('Chưa có lượt giải hợp lệ.');
 }catch{if(active===request&&!request.signal.aborted)status.textContent=t('Không tải được bảng xếp hạng. Hãy thử làm mới.');}
}
for(const button of buttons)button.onclick=()=>{
 if(size===Number(button.dataset.size))return;
 size=Number(button.dataset.size);rows.replaceChildren();caption.textContent=size+'×'+size;
 for(const item of buttons)item.setAttribute('aria-pressed',String(item===button));
 void load();
};
document.querySelector<HTMLButtonElement>('#board-refresh')!.onclick=()=>void load();
let refreshTimer:ReturnType<typeof setInterval>|undefined;
function startRefresh(){
 if(refreshTimer!==undefined)clearInterval(refreshTimer);
 refreshTimer=setInterval(()=>{if(!document.hidden)void load();},30000);
}
window.addEventListener('pagehide',()=>{active?.abort();clearInterval(refreshTimer);});
window.addEventListener('pageshow',event=>{if(event.persisted){startRefresh();void load();}});
startRefresh();
void load();

void browserAccount(false).then(account=>{const wallet=mountWallet(account);window.addEventListener('pagehide',()=>{wallet.dispose();account?.dispose();},{once:true});}).catch(()=>{});
