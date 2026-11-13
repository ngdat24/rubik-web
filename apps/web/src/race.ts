import {browserAccount} from './account.js';
import {CubeController,loadSettings} from '@rubik/controller';
import {CubeRenderer,viewMove} from '@rubik/renderer';
import {isSolved,f2lSolvedAny,formatTime} from '@rubik/engine';
import type {MoveEvent} from '@rubik/engine';
import {attachKeyboard} from './keyboard.js';
import {attachDrag} from './drag.js';
import './style.css';

interface Run {k:number;endT:number;preEvents:MoveEvent[];events:MoveEvent[]}
interface Snapshot {
  id:string;mode:string;durationMs:number;serverNow:number;startMs:number|null;phase:string;final:boolean;result:'A'|'B'|'draw'|null;
  ack:number;runs:Run[];scrambles:{k:number;moves:string[]}[];
  players:{id:string;name:string;ready:boolean;score:{score:number;lastEndT:number;totalMoves:number}}[];
}
interface Draft {k:number;preEvents:MoveEvent[];events:MoveEvent[];pending:Run[]}
function readDraft(text:string):Draft{
  const value=JSON.parse(text) as Draft;
  const events=(items:MoveEvent[],max:number)=>Array.isArray(items)&&items.length<=max&&items.every(e=>e&&typeof e.m==='string'&&e.m.length<=12&&Number.isSafeInteger(e.t)&&e.t>=0);
  if(!value||!Number.isSafeInteger(value.k)||value.k<0||value.k>1000||!events(value.preEvents,200)||!events(value.events,4000)||
    !Array.isArray(value.pending)||value.pending.length>1000||!value.pending.every((run,i)=>run&&run.k===value.k-value.pending.length+i&&Number.isSafeInteger(run.endT)&&events(run.preEvents,200)&&events(run.events,4000)))throw new Error('Tiến độ local không hợp lệ.');
  return value;
}
const el=<T extends HTMLElement>(id:string)=>document.getElementById(id) as T;
const message=el('race-message'),clock=el('race-clock'),phase=el('race-phase');
const code=el<HTMLInputElement>('race-code'),mode=el<HTMLSelectElement>('race-mode');
const create=el<HTMLButtonElement>('race-create'),join=el<HTMLButtonElement>('race-join'),ready=el<HTMLButtonElement>('race-ready');
const copy=el<HTMLButtonElement>('race-copy'),forfeit=el<HTMLButtonElement>('race-forfeit');
const dialog=el<HTMLDialogElement>('race-forfeit-dialog');
let disposed=false,frame=0,poll=0;
const cleanup:(()=>void)[]=[];

async function boot():Promise<void>{
  const account=await browserAccount();
  if(!account)throw new Error('Phòng online cần cấu hình Supabase/Vercel. Chế độ LAN chưa phục vụ phòng này.');
  cleanup.push(account.dispose);
  const {client}=account,user=account.id;
  const profileRequest=async(name?:string)=>{
    const response=await fetch('/api/player',{method:name===undefined?'GET':'POST',headers:{Authorization:'Bearer '+await account.token(),'Content-Type':'application/json'},...(name===undefined?{}:{body:JSON.stringify({name})}),signal:AbortSignal.timeout(10000)});
    const value=await response.json();if(!response.ok)throw new Error(value.error??'Chưa lưu được tên.');return value;
  };
  if(!(await profileRequest()).name){
    const nameDialog=el<HTMLDialogElement>('race-name-dialog'),form=el<HTMLFormElement>('race-name-form');
    nameDialog.oncancel=e=>e.preventDefault();nameDialog.showModal();
    await new Promise<void>(resolve=>{form.onsubmit=async e=>{
      e.preventDefault();const button=form.querySelector<HTMLButtonElement>('button')!;button.disabled=true;
      try{await profileRequest(el<HTMLInputElement>('race-name').value);form.onsubmit=null;nameDialog.close();resolve();}
      catch(error){el('race-name-error').textContent=error instanceof Error?error.message:'Không lưu được tên.';}
      finally{button.disabled=false;}
    };});
  }
  if(disposed)return;
  const renderer=new CubeRenderer(el('viewport'));renderer.setSpeed(40);
  const controller=new CubeController(renderer);controller.lockInput('race');
  renderer.onContextChange=available=>available?controller.unlockInput('context'):controller.lockInput('context');
  const settings=loadSettings(()=>localStorage).settings;
  cleanup.push(attachKeyboard(controller,()=>{},()=>settings.profiles[settings.activeProfile]!.bindings,
    move=>el<HTMLInputElement>('race-fixed-keys').checked?move:viewMove(move,renderer.getViewFaces())));
  cleanup.push(attachDrag(renderer,controller,()=>{}),()=>controller.dispose());
  let room:Snapshot|undefined,roomId='',busy=false,origin:number|undefined,loaded=-1,loading=false;
  let draft:Draft={k:0,preEvents:[],events:[],pending:[]};
  const scrambles=new Map<number,string[]>();
  const storageKey=()=>`rubik.race.v1:${user}:${roomId}`;
  const save=()=>{try{localStorage.setItem(storageKey(),JSON.stringify(draft));}catch{message.textContent='Không lưu được hàng chờ trên thiết bị. Giữ trang mở để gửi kết quả.';}};
  const time=(stamp=performance.now())=>origin===undefined?-18001:Math.floor(stamp-origin);
  const load=()=>{
    if(loaded===draft.k||!scrambles.has(draft.k))return;
    loading=true;controller.setMoveGate(undefined);controller.unlockInput('race');controller.reset();
    controller.sequence([...scrambles.get(draft.k)!,...draft.preEvents.map(e=>e.m),...draft.events.map(e=>e.m)].join(' '),0);
    renderer.setState(controller.cube.state);renderer.resetCamera();loaded=draft.k;loading=false;
    el('scramble-text').textContent=scrambles.get(draft.k)!.join(' ');
    controller.setMoveGate((move,stamp)=>{
      const t=time(stamp);
      const previous=draft.events.at(-1)?.t??draft.pending.at(-1)?.endT??room?.runs.at(-1)?.endT??0;
      return !!room&&!room.final&&loaded===draft.k&&
        ((t>=-15000&&t<0&&draft.k===0&&draft.preEvents.length<200&&move.type==='rotation')||(t>=previous&&t<=room.durationMs&&draft.events.length<4000));
    });
  };
  const draw=()=>{
    if(disposed)return;
    const t=time();
    const active=!!room&&!room.final&&loaded===draft.k&&origin!==undefined&&t>=-15000&&t<=room.durationMs;
    if(active)controller.unlockInput('race');else controller.lockInput('race');
    clock.textContent=!room||origin===undefined?'—':t< -15000?String(Math.ceil((-15000-t)/1000)):t<0?String(Math.ceil(-t/1000)):formatTime(Math.max(0,room.durationMs-t));
    phase.textContent=!room?'Chưa vào phòng':room.final?'Kết thúc':origin===undefined?'Chờ hai người sẵn sàng':t< -15000?'Đếm ngược':t<0?'Inspection · chỉ x/y/z':t<=room.durationMs?(loaded===draft.k?`Đang giải khối ${draft.k+1}`:'Chờ scramble tiếp theo…'):'Hết giờ · đang chốt kết quả';
    frame=requestAnimationFrame(draw);
  };
  const api=async(action:string,extra:Record<string,unknown>={}):Promise<Snapshot>=>{
    const {data:{session:current}}=await client.auth.getSession();
    if(current?.user.id!==user)throw new Error('Phiên hồ sơ đã đổi. Hãy tải lại trang.');
    const started=performance.now();
    const response=await fetch(action==='get'?`/api/race?id=${roomId}`:'/api/race',{
      method:action==='get'?'GET':'POST',headers:{Authorization:`Bearer ${current.access_token}`,'Content-Type':'application/json'},
      ...(action==='get'?{}:{body:JSON.stringify({id:roomId,action,...extra})}),signal:AbortSignal.timeout(8000)});
    const value=await response.json();if(!response.ok)throw new Error(value.error??'Không kết nối được phòng.');
    const next=value as Snapshot;
    // Establish a monotonic input origin once per page/match. Network polls never
    // move a running clock backwards or rewrite already captured event timestamps.
    if(origin===undefined&&next.startMs!==null)origin=started+(performance.now()-started)/2+(next.startMs+18000-next.serverNow);
    return next;
  };
  const accept=(next:Snapshot)=>{
    const starting=room?.startMs==null&&next.startMs!==null;
    room=next;
    for(const item of next.scrambles)scrambles.set(item.k,item.moves);
    draft.pending=draft.pending.filter(run=>run.k>next.ack);
    if(draft.k<=next.ack){draft.k=next.ack+1;draft.events=[];draft.preEvents=[];}
    load();save();
    el('race-players').replaceChildren(...next.players.map(player=>{
      const li=document.createElement('li');
      li.textContent=`${player.name}${player.id===user?' (bạn)':''} · ${player.ready?'Sẵn sàng':'Đang chờ'} · ${player.score.score} khối · ${formatTime(player.score.lastEndT)} · ${player.score.totalMoves} nước`;
      return li;
    }));
    ready.disabled=next.startMs!==null||next.final||!!next.players.find(p=>p.id===user)?.ready;
    if(starting)el<HTMLDetailsElement>('race-lobby-controls').open=false;
    if(next.final)el<HTMLDetailsElement>('race-lobby-controls').open=true;
    el('race-new').hidden=!next.final;
    forfeit.disabled=next.final;copy.disabled=false;create.disabled=join.disabled=true;mode.disabled=true;
    if(next.final)el('race-result').textContent=next.result==='draw'?'Hòa':next.result?`Người thắng: ${next.players[next.result==='A'?0:1]!.name}`:'Phòng đã đóng';
    else el('race-result').textContent=draft.pending.length?`${draft.pending.length} khối đang chờ xác nhận`:'Các khối đã gửi được server xác nhận.';
  };
  const sync=async(action='get',extra:Record<string,unknown>={})=>{
    if(busy||!roomId||disposed)return;busy=true;
    try{
      accept(await api(action,extra));
      while(draft.pending.length&&!room!.final){accept(await api('cube_done',{run:draft.pending[0]}));}
      message.textContent=room!.final?'Trận đã được server chốt.':room!.startMs===null?'Đã kết nối phòng. Mời bạn bằng link; cả hai bấm Sẵn sàng để bắt đầu.':'Đã kết nối · tiến độ đối thủ cập nhật mỗi giây.';
    }catch(error){message.textContent=`${error instanceof Error?error.message:'Mất kết nối.'} Hàng chờ được giữ để thử lại.`;}
    finally{busy=false;}
  };
  cleanup.push(controller.onMoveApplied(event=>{
    if(loading||!room)return;
    const t=time(event.t),item={m:event.move,t:t<0?t+15000:t};
    if(t<0)draft.preEvents.push(item);
    else{
      draft.events.push(item);
      if(room.mode==='fullSolve'?isSolved(event.stateAfter,3):f2lSolvedAny(event.stateAfter)){
        draft.pending.push({k:draft.k,endT:t,preEvents:draft.preEvents,events:draft.events});
        draft.k++;draft.preEvents=[];draft.events=[];save();load();
        if(loaded!==draft.k)controller.lockInput('race');
        void sync();
      }
    }
    save();
  }));
  const enter=async(action:'join'|'create')=>{
    if(busy||room)return;
    roomId=code.value.trim();if(!/^[a-f0-9]{32}$/.test(roomId)){message.textContent='Mã phòng gồm 32 ký tự a–f / 0–9.';return;}
    draft={k:0,preEvents:[],events:[],pending:[]};
    try{
      const saved=localStorage.getItem(storageKey());if(saved)draft=readDraft(saved);
    }catch{message.textContent='Không đọc được tiến độ local; sẽ khôi phục các khối server đã nhận.';}
    await sync(action,{mode:mode.value});
    if(room)history.replaceState(null,'',`/race.html?room=${roomId}`);
  };
  create.onclick=()=>{code.value=crypto.randomUUID().replaceAll('-','');void enter('create');};
  el<HTMLFormElement>('race-join-form').onsubmit=e=>{e.preventDefault();void enter('join');};
  ready.onclick=()=>{ready.blur();void sync('ready');};
  copy.onclick=()=>{void navigator.clipboard.writeText(`${location.origin}/race.html?room=${roomId}`).then(()=>{message.textContent='Đã sao chép link mời.';},()=>{message.textContent=`Link mời: ${location.origin}/race.html?room=${roomId}`;});};
  forfeit.onclick=()=>dialog.showModal();el('race-keep').onclick=()=>dialog.close();
  el('race-confirm-forfeit').onclick=()=>{dialog.close();void sync('forfeit');};
  el('race-camera').onclick=()=>renderer.resetCamera();
  message.textContent='Tạo phòng hoặc mở link mời từ bạn.';
  const invite=new URLSearchParams(location.search).get('room');if(invite){code.value=invite;await enter('join');}
  const tick=()=>{if(disposed)return;void sync().finally(()=>{if(!disposed)poll=window.setTimeout(tick,1000);});};
  poll=window.setTimeout(tick,1000);draw();
}
void boot().catch(error=>{message.textContent=error instanceof Error?error.message:'Không mở được phòng.';create.disabled=join.disabled=true;});
const dispose=()=>{disposed=true;clearTimeout(poll);cancelAnimationFrame(frame);for(const off of cleanup)off();};
window.addEventListener('pagehide',event=>{if(!event.persisted)dispose();});
import.meta.hot?.dispose(dispose);
