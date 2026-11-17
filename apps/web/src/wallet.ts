import type {CloudAccount} from './account.js';
import {language,t} from './i18n.js';

export function mountWallet(account:CloudAccount|undefined) {
  const balance=document.querySelector<HTMLOutputElement>('#economy-wallet')!;
  const abort=new AbortController();
  const formatter=new Intl.NumberFormat(language==='vi'?'vi-VN':'en');
  let latest=0;
  balance.hidden=!account;
  async function refresh() {
    if (!account || document.hidden || abort.signal.aborted) return;
    const current=++latest;
    try {
      const response=await fetch('/api/wallet',{
        headers:{Authorization:'Bearer '+await account.token()},
        signal:AbortSignal.any([abort.signal,AbortSignal.timeout(10000)])
      });
      if (current!==latest || abort.signal.aborted) return;
      if (response.status===403) {balance.textContent=t('Đặt tên hồ sơ để mở ví.');return;}
      if (!response.ok) throw new Error();
      const {cb,zn}=await response.json();
      if (current!==latest || abort.signal.aborted) return;
      balance.textContent=formatter.format(cb)+' CB · '+formatter.format(zn)+' ZN';
    } catch {
      if (!abort.signal.aborted && current===latest && !balance.textContent) balance.textContent=t('Chưa tải được số dư.');
    }
  }
  const changed=()=>void refresh();
  window.addEventListener('rubik-profile-updated',changed);
  window.addEventListener('online',changed);
  window.addEventListener('rubik-quest-solve-synced',changed);
  window.addEventListener('rubik-quest-reward-changed',changed);
  document.addEventListener('visibilitychange',changed);
  window.addEventListener('rubik-shop-updated',changed);
  void refresh();
  return {refresh,dispose:()=>{
    abort.abort();
    window.removeEventListener('rubik-profile-updated',changed);
    window.removeEventListener('online',changed);
    window.removeEventListener('rubik-quest-solve-synced',changed);
    window.removeEventListener('rubik-quest-reward-changed',changed);
    document.removeEventListener('visibilitychange',changed);
    window.removeEventListener('rubik-shop-updated',changed);
  }};
}
