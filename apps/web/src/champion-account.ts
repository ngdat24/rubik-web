import type {CloudAccount} from './account.js';
import type {ChampionClaim,ChampionSize} from './champion-design.js';

export type ChampionAward={size:ChampionSize;variant:null;name:null}|(ChampionClaim&{size:ChampionSize});
type Choice=(ChampionClaim&{size:ChampionSize})|{action:'rename';size:ChampionSize;name:string;requestId:string};
export async function championAwards(account:CloudAccount,choice?:Choice):Promise<ChampionAward[]> {
  const response=await fetch('/api/champion',{
    method:choice?'POST':'GET',
    headers:{Authorization:'Bearer '+await account.token(),...(choice?{'Content-Type':'application/json'}:{})},
    ...(choice?{body:JSON.stringify({action:'claim',...choice})}:{}),
    signal:AbortSignal.timeout(12000)
  });
  const data=await response.json();
  if(!response.ok)throw new Error(data.error??'Không tải được quyền nhận Champion.');
  return data.awards;
}
