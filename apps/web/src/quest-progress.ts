import {formatTime} from '@rubik/engine';
import type {CloudAccount} from './account.js';
import {startQuestHeartbeat} from './quest-heartbeat.js';
import {t} from './i18n.js';

interface Progress {
  completed:number;
  streak:number;
  counts:[number,number,number,number];
  onlineSeconds:number;
  pbs:{size:number;kind:'single'|'mo3'|'ao5'|'ao12';timeMs:number}[];
}

export function mountQuestProgress(account:CloudAccount|undefined) {
  const panel=document.querySelector<HTMLElement>('#quest-panel')!;
  const tasks=document.querySelector<HTMLOListElement>('#quest-tasks')!;
  const streak=document.querySelector<HTMLElement>('#quest-streak')!;
  const bests=document.querySelector<HTMLElement>('#quest-bests')!;
  const abort=new AbortController();
  let latest=0;
  async function refresh(activity?:Progress) {
    if (!account || document.hidden || abort.signal.aborted) return;
    const id=++latest;
    try {
      const state=activity ?? await fetch('/api/quests',{
        headers:{Authorization:'Bearer '+await account.token()},
        signal:AbortSignal.any([abort.signal,AbortSignal.timeout(10000)])
      }).then(response=>response.ok ? response.json() as Promise<Progress> : undefined);
      if (!state) return;
      if (id!==latest || abort.signal.aborted) return;
      const [two,three,four,large]=state.counts;
      const list=[
        t('Giải 10 lượt 2×2, 5 lượt 3×3, 3 lượt 4×4 hoặc 1 lượt khối 5×5–10×10')+
          ' · 2×2 '+Math.min(two,10)+'/10 · 3×3 '+Math.min(three,5)+'/5 · 4×4 '+Math.min(four,3)+'/3 · 5×5–10×10 '+Math.min(large,1)+'/1',
        t('Hoàn thành một phiên Time Limit ở chế độ bất kỳ'),
        t('Online 10 phút')+' · '+formatTime((state.onlineSeconds ?? 0)*1000)+' / 10:00'
      ];
      tasks.replaceChildren(...list.map((label,index)=>{
        const item=document.createElement('li');
        item.textContent=(state.completed & (1<<index) ? t('Đã xong')+' · ' : '')+label;
        return item;
      }));
      streak.textContent=t('Chuỗi chuyên cần')+` · ${state.streak}/7`;
      bests.textContent=state.pbs.map(({size,kind,timeMs})=>`${size}×${size} ${kind==='mo3'?'ao3':kind} ${formatTime(timeMs)}`).join(' · ');
      panel.hidden=false;
    } catch {/* Keep the latest result visible when a refresh fails. */}
  }
  const update=()=>void refresh();
  for (const event of ['rubik-profile-updated','rubik-quest-solve-synced','online','focus']) window.addEventListener(event,update);
  document.addEventListener('visibilitychange',update);
  const stopHeartbeat=startQuestHeartbeat<Progress>(account,state=>void refresh(state));
  void refresh();
  return {refresh,dispose:()=>{
    stopHeartbeat();
    abort.abort();
    document.removeEventListener('visibilitychange',update);
    for (const event of ['rubik-profile-updated','rubik-quest-solve-synced','online','focus']) window.removeEventListener(event,update);
  }};
}
