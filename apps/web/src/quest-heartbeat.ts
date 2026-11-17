import type {CloudAccount} from './account.js';

export function startQuestHeartbeat<T extends {completed:number}>(account:CloudAccount|undefined,onProgress?:(state:T)=>void) {
  if (!account) return ()=>{};
  const abort = new AbortController();
  let busy = false;
  let completed = 0;
  async function ping() {
    if (busy || document.hidden || !navigator.onLine || abort.signal.aborted) return;
    busy = true;
    try {
      const response = await fetch('/api/quests',{
        method:'POST',body:'{}',
        headers:{Authorization:'Bearer '+await account!.token(),'Content-Type':'application/json'},
        signal:AbortSignal.any([abort.signal,AbortSignal.timeout(10000)])
      });
      if (!response.ok || abort.signal.aborted) return;
      const state:T=await response.json();
      if (abort.signal.aborted) return;
      onProgress?.(state);
      if (state.completed!==completed) {
        completed=state.completed;
        window.dispatchEvent(new Event('rubik-quest-reward-changed'));
      }
    } catch {/* The next heartbeat resumes from the server's last acknowledged time. */}
    finally { busy=false; }
  }
  const update=()=>void ping();
  const timer=window.setInterval(update,15000);
  window.addEventListener('rubik-profile-updated',update);
  window.addEventListener('online',update);
  document.addEventListener('visibilitychange',update);
  update();
  return ()=>{
    abort.abort();
    window.clearInterval(timer);
    window.removeEventListener('rubik-profile-updated',update);
    window.removeEventListener('online',update);
    document.removeEventListener('visibilitychange',update);
  };
}
