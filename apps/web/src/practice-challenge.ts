import type {CubeController} from '@rubik/controller';
import type {Solve} from '@rubik/timer';
import type {CloudAccount} from './account.js';
import {t} from './i18n.js';

interface Challenge {id:string;seed:string;size:number;scrambleIndex:0}
interface Receipt {eligible:boolean}

export function mountPracticeChallenge(
  account:CloudAccount|undefined,
  controller:CubeController,
  apply:(seed:string)=>boolean,
  isRunning:()=>boolean
) {
  const button=document.querySelector<HTMLButtonElement>('#practice-online')!;
  const status=document.querySelector<HTMLElement>('#practice-status')!;
  const abort=new AbortController();
  let revision=0;
  let issuing=false;
  let challenge:Challenge|undefined;

  const reset=controller.onStateReplaced(()=>{
    revision++;
    challenge=undefined;
  });
  async function request<T>(body:unknown):Promise<T> {
    if (!account) throw new Error('Đặt tên hồ sơ trước khi lấy scramble máy chủ.');
    const response=await fetch('/api/practice',{
      method:'POST',headers:{Authorization:'Bearer '+await account.token(),'Content-Type':'application/json'},
      body:JSON.stringify(body),signal:AbortSignal.any([abort.signal,AbortSignal.timeout(10000)])
    });
    const result=await response.json().catch(()=>null);
    if (!response.ok || !result) throw new Error(result?.error ?? 'Chưa kết nối được máy chủ luyện tập.');
    return result;
  }
  function showError(error:unknown) {
    if (!abort.signal.aborted) {
      const message=error instanceof Error ? error.message : '';
      status.textContent=t(message==='Đặt tên hồ sơ trước khi lấy scramble máy chủ.'
        ? message : 'Chưa kết nối được máy chủ luyện tập.');
    }
  }
  button.hidden=!account;
  button.onclick=async()=>{
    if (issuing || isRunning()) return;
    issuing=true;
    const before=revision;
    try {
      const result=await request<Challenge>({action:'issue',size:controller.size});
      if (before===revision && !isRunning() && result.size===controller.size && apply(result.seed)) {
        challenge=result;
        status.textContent=t('Đã lấy scramble máy chủ.');
      }
    } catch(error) {showError(error);}
    finally {issuing=false;}
  };
  return {
    async completed(solve:Solve) {
      const issued=challenge;
      if (!issued || solve.seed!==issued.seed || solve.size!==issued.size || solve.penalty==='DNF') return;
      challenge=undefined;
      try {
        const receipt=await request<Receipt>({action:'finish',challengeId:issued.id,solve});
        if (!abort.signal.aborted) status.textContent=t(receipt.eligible ? 'Máy chủ đã xác minh lượt giải.'
          : 'Lượt giải đã lưu, chưa đạt ngưỡng tính thưởng.');
      } catch(error) {showError(error);}
    },
    dispose() {
      abort.abort();
      reset();
      button.onclick=null;
    }
  };
}
