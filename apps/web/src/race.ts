import {mountWallet} from './wallet.js';
import {t as translate} from './i18n.js';
import {startQuestHeartbeat} from './quest-heartbeat.js';
import {browserAccount} from './account.js';
import {accessUrl,accountLoginEnabled} from './auth-client.js';
import {CubeController,loadSettings} from '@rubik/controller';
import {CubeRenderer,viewMove} from '@rubik/renderer';
import {formatTime,solvedState} from '@rubik/engine';
import {raceComplete} from '../../../shared/race-rules.mjs';
import type {MoveEvent} from '@rubik/engine';
import {attachKeyboard} from './keyboard.js';
import {attachDrag} from './drag.js';
import {mountTimeLimitBoard} from './time-limit-board.js';
import {bindSkinEffects,readSkinLowFx,skinLayout,skinPalette,skinSurface} from './skin-effects.js';
import type {Appearance} from './skin-effects.js';
import './style.css';
import {loadEquippedChampion} from './champion-equipped.js';
import {mountChampionFrame} from './champion-frame.js';
import {mountChampionMotion} from './champion-motion.js';
import {mountCommunityChat} from './community-chat.js';

interface Run {k:number;endT:number;preEvents:MoveEvent[];events:MoveEvent[]}
interface Snapshot {
  id:string;mode:string;durationMs:number;serverNow:number;startMs:number|null;phase:string;final:boolean;result:'A'|'B'|'draw'|null;
  ack:number;runs:Run[];scrambles:{k:number;moves:string[]}[];
  players:{id:string;name:string;ready:boolean;present?:boolean;rematch?:boolean;nameplate?:'neon'|'gold';skinId?:string;score:{score:number;lastEndT:number;totalMoves:number}}[];
  opponent?:{id:string;name:string;k:number;state:number[];moveCount:number;updatedAt:number|null}|null;
  abandoned?:boolean;
  economy?:{ticket:'free_ticket'|'paid_ticket'|'practice'|'insufficient'|null;fee:number|null;reward:{cb:number;zn:number}|null};
  round?:string;nextMode?:string;gone?:boolean;left?:boolean;
  stake?:number;owner?:string;
  escrow?:{state:'locked'|'settled'|'refunded';winner:string|null;burnedCb:number;stake:number}|null;
}
interface Draft {k:number;preEvents:MoveEvent[];events:MoveEvent[];pending:Run[]}
class RoomApiError extends Error {constructor(message:string,readonly status:number){super(message);}}
function readDraft(text:string):Draft{
  const value=JSON.parse(text) as Draft;
  const events=(items:MoveEvent[],max:number)=>Array.isArray(items)&&items.length<=max&&items.every(e=>e&&typeof e.m==='string'&&e.m.length<=12&&Number.isSafeInteger(e.t)&&e.t>=0);
  if(!value||!Number.isSafeInteger(value.k)||value.k<0||value.k>1000||!events(value.preEvents,200)||!events(value.events,4000)||
    !Array.isArray(value.pending)||value.pending.length>1000||!value.pending.every((run,i)=>run&&run.k===value.k-value.pending.length+i&&Number.isSafeInteger(run.endT)&&events(run.preEvents,200)&&events(run.events,4000)))throw new Error(translate("Tiến độ local không hợp lệ."));
  return value;
}
const el=<T extends HTMLElement>(id:string)=>document.getElementById(id) as T;
const solo=document.body.dataset.mode==='time-limit';
const message=el('race-message'),clock=el('race-clock'),phase=el('race-phase');
const code=document.querySelector<HTMLInputElement>('#race-code'),mode=el<HTMLSelectElement>('race-mode');
const create=el<HTMLButtonElement>('race-create'),join=document.querySelector<HTMLButtonElement>('#race-join'),ready=document.querySelector<HTMLButtonElement>('#race-ready');
const copy=document.querySelector<HTMLButtonElement>('#race-copy'),forfeit=document.querySelector<HTMLButtonElement>('#race-forfeit');
const leave=document.querySelector<HTMLButtonElement>('#race-leave'),rematch=document.querySelector<HTMLButtonElement>('#race-rematch');
const dialog=el<HTMLDialogElement>('race-forfeit-dialog');
const stakeSelect=document.querySelector<HTMLSelectElement>('#race-stake');
const stakeControls=document.querySelector<HTMLElement>('#race-wager-controls');
let disposed=false,frame=0,poll=0;
const cleanup:(()=>void)[]=[];

async function boot():Promise<void>{
  const board=solo?mountTimeLimitBoard():undefined;if(board)cleanup.push(board.dispose);
  const accountReady=browserAccount();
  if(solo)cleanup.push(mountCommunityChat(accountReady.catch(()=>undefined)));
  const account=await accountReady;
  if(!account&&accountLoginEnabled){
    const link=document.createElement('a');
    link.href=accessUrl();
    link.textContent=translate('Đăng nhập để chơi online');
    message.replaceChildren(link);
    create.disabled=true;if(join)join.disabled=true;
    return;
  }
  if(!account)throw new Error(translate("Phòng online cần cấu hình Supabase/Vercel. Chế độ LAN chưa phục vụ phòng này."));
  cleanup.push(account.dispose,startQuestHeartbeat(account));
  const targetLabel=document.querySelector<HTMLElement>('#time-limit-target');
  const showTarget=(value:string,playing=false)=>{if(targetLabel)targetLabel.textContent=(playing?translate("Đang chơi: "):translate("Sẽ chơi: "))+({oneFace:translate("1 mặt"),f2lRush:'F2L',fullSolve:'full'} as Record<string,string>)[value];};
  if(solo){showTarget(mode.value);mode.onchange=()=>{showTarget(mode.value);board?.select(mode.value);};}
  const navWallet=mountWallet(account);cleanup.push(navWallet.dispose);
  const {client}=account,user=account.id;
  const renderer=new CubeRenderer(el('viewport'));renderer.setSpeed(40);
  const controller=new CubeController(renderer);controller.lockInput('race');
  cleanup.push(()=>controller.dispose());
  let championWarning='';
  const championRequest=loadEquippedChampion(account,3).catch(()=>{championWarning=translate('Không tải được quyền nhận Champion.');return undefined;});
  const profileRequest=async(name?:string)=>{
    const response=await fetch('/api/player',{method:name===undefined?'GET':'POST',headers:{Authorization:'Bearer '+await account.token(),'Content-Type':'application/json'},...(name===undefined?{}:{body:JSON.stringify({name})}),signal:AbortSignal.timeout(10000)});
    const value=await response.json();if(!response.ok)throw new Error(value.error??translate("Chưa lưu được tên."));return value;
  };
  if(!(await profileRequest()).name){
    const nameDialog=el<HTMLDialogElement>('race-name-dialog'),form=el<HTMLFormElement>('race-name-form');
    nameDialog.oncancel=e=>e.preventDefault();nameDialog.showModal();
    await new Promise<void>(resolve=>{form.onsubmit=async e=>{
      e.preventDefault();const button=form.querySelector<HTMLButtonElement>('button')!;button.disabled=true;
      try{await profileRequest(el<HTMLInputElement>('race-name').value);form.onsubmit=null;nameDialog.close();resolve();}
      catch(error){el('race-name-error').textContent=error instanceof Error?translate(error.message):translate("Không lưu được tên.");}
      finally{button.disabled=false;}
    };});
  }
  if(disposed)return;
  // Finish cosmetics before enabling room actions; snapshots/polling must never replace it mid-solve.
  const champion=await championRequest;
  if(disposed)return;
  const championFrame=champion?mountChampionFrame(el('viewport'),champion.name,3):undefined;
  if(champion)renderer.setAppearance(champion.options,controller.cube.state);
  const championMotion=champion?mountChampionMotion(el('viewport'),renderer,controller,champion.sound,()=>!readSkinLowFx()&&!loading,3):undefined;
  cleanup.push(()=>{championMotion?.dispose();championFrame?.dispose();});
  const opponentRenderer=solo?undefined:new CubeRenderer(el('opponent-viewport'));
  if(opponentRenderer){opponentRenderer.setSize(3);opponentRenderer.setState(solvedState(3));cleanup.push(()=>opponentRenderer.dispose());}
  let opponentState='',sentProgress='';
  let opponentDisplay=solvedState(3);
  const skinAbort=new AbortController();
  const requestedSkins=new Map<CubeRenderer,string>();
  const catalog=new Map<string,Promise<Appearance>>();
  let effects:ReturnType<typeof bindSkinEffects>|undefined;
  cleanup.push(()=>{skinAbort.abort();effects?.dispose();});
  const applySkin=(viewer:CubeRenderer,id?:string)=>{
    if(champion&&viewer===renderer)return;
    const key=id??'';
    if ((requestedSkins.get(viewer)??'')===key) return;
    requestedSkins.set(viewer,key);
    let loadingAppearance=id ? catalog.get(id) : undefined;
    if (id&&!loadingAppearance) {
      loadingAppearance=fetch('/api/skin-appearance?id='+encodeURIComponent(id),{signal:skinAbort.signal})
        .then(async response=>{
          if (!response.ok) throw new Error();
          return (await response.json()).appearance as Appearance;
        });
      catalog.set(id,loadingAppearance);
    }
    return Promise.resolve(loadingAppearance).then(appearance=>{
      if (skinAbort.signal.aborted||requestedSkins.get(viewer)!==key) return;
      const surface=skinSurface(appearance);
      if (surface&&readSkinLowFx()) delete surface.pulse;
      viewer.setAppearance({...skinLayout(appearance),theme:skinPalette(appearance),...(surface?{surface}:{})},viewer===renderer?controller.cube.state:opponentDisplay);
      if (viewer===renderer) {
        effects?.dispose();
        effects=appearance&&!readSkinLowFx()?bindSkinEffects(renderer,appearance):undefined;
      }
    }).catch(()=>{
      if (id) catalog.delete(id);
      if (requestedSkins.get(viewer)===key) requestedSkins.delete(viewer);
    });
  };
  if(solo&&!champion){
    try{
      const response=await fetch('/api/skins',{
        headers:{Authorization:'Bearer '+await account.token()},
        signal:AbortSignal.any([skinAbort.signal,AbortSignal.timeout(10000)])
      });
      if(response.ok){
        const {equipped}=await response.json() as {equipped?:string|null};
        if(equipped&&!disposed)await applySkin(renderer,equipped);
      }
    }catch{/* Time Limit remains playable if cosmetics are unavailable. */}
  }
  if(disposed)return;
  renderer.onMoveAnimated=()=>effects?.play();
  renderer.onContextChange=available=>available?controller.unlockInput('context'):controller.lockInput('context');
  const settings=loadSettings(()=>localStorage).settings;
  cleanup.push(attachKeyboard(controller,()=>{},()=>settings.profiles[settings.activeProfile]!.bindings,
    move=>el<HTMLInputElement>('race-fixed-keys').checked?move:viewMove(move,renderer.getViewFaces())));
  cleanup.push(attachDrag(renderer,controller,()=>{},championMotion?.commit));
  let room:Snapshot|undefined,roomId='',busy=false,origin:number|undefined,loaded=-1,loading=false;
  const connection=crypto.randomUUID().replaceAll('-','');let accessToken='';
  let queuedAction:{action:string;extra:Record<string,unknown>}|undefined;
  let nextScrambleCheck=0;
  const pendingAction=(action:string)=>{
    message.textContent=({create:solo?translate("Đang bắt đầu lượt…"):translate("Đang tạo phòng…"),join:translate("Đang vào phòng…"),ready:translate("Đang gửi sẵn sàng…"),forfeit:translate("Đang hủy lượt…"),leave:translate("Đang rời phòng…"),rematch:translate("Đang gửi đấu lại…"),mode:translate("Đang đổi chế độ…")} as Record<string,string>)[action]??translate("Đang kết nối…");
    if(action==='create'||action==='join'){create.disabled=true;mode.disabled=true;if(join)join.disabled=true;}
    if(action==='ready'&&ready)ready.disabled=true;
    if(action==='forfeit'&&forfeit)forfeit.disabled=true;
    if(action==='leave'&&leave)leave.disabled=true;
    if(action==='rematch'&&rematch)rematch.disabled=true;
    if(action==='mode')mode.disabled=true;
    if(action==='stake'&&stakeSelect)stakeSelect.disabled=true;
  };
  let draft:Draft={k:0,preEvents:[],events:[],pending:[]};
  const scrambles=new Map<number,string[]>();
  const storageKey=()=>`rubik.${solo?'time-limit':'race'}.v1:${user}:${roomId}${room?.round?':'+room.round:''}`;
  const resetRoom=()=>{
    room=undefined;roomId='';origin=undefined;loaded=-1;nextScrambleCheck=0;sentProgress='';queuedAction=undefined;scrambles.clear();
    if(stakeControls)stakeControls.hidden=true;
    if(!solo)applySkin(renderer);
    if(opponentRenderer)applySkin(opponentRenderer);
    draft={k:0,preEvents:[],events:[],pending:[]};controller.setMoveGate(undefined);controller.reset();controller.lockInput('race');
    opponentDisplay=solvedState(3);opponentRenderer?.setState(opponentDisplay);opponentState='';
    el('race-players').replaceChildren();el('race-result').textContent='';el('scramble-text').textContent=translate("Tạo phòng hoặc nhập mã 8 ký tự để vào phòng.");
    create.disabled=false;if(join)join.disabled=false;if(ready)ready.disabled=true;if(copy)copy.disabled=true;if(leave)leave.disabled=true;
    if(rematch){rematch.hidden=true;rematch.disabled=true;}mode.disabled=true;if(code)code.value='';
    el<HTMLDetailsElement>('race-lobby-controls').open=true;
    el('race-opponent-status').textContent=translate("Đang chờ đối thủ");
    history.replaceState(null,'','/race.html');
  };
  const save=()=>{try{localStorage.setItem(storageKey(),JSON.stringify(draft));}catch{message.textContent=translate("Không lưu được hàng chờ trên thiết bị. Giữ trang mở để gửi kết quả.");}};
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
    // Fetch at the countdown boundary instead of waiting for the next poll
    // (which is scheduled one second AFTER its previous response arrives).
    if(room&&!room.final&&origin!==undefined&&t>=-15000&&t<0&&loaded<0&&!busy&&performance.now()>=nextScrambleCheck){
      nextScrambleCheck=performance.now()+500;void sync();
    }
    const active=!!room&&!room.final&&loaded===draft.k&&origin!==undefined&&t>=-15000&&t<=room.durationMs;
    if(active)controller.unlockInput('race');else controller.lockInput('race');
    clock.textContent=!room||origin===undefined||room.abandoned?'—':t< -15000?String(Math.ceil((-15000-t)/1000)):t<0?String(Math.ceil(-t/1000)):formatTime(Math.max(0,room.durationMs-t));
    phase.textContent=!room?(solo?translate("Chưa bắt đầu"):translate("Chưa vào phòng")):room.final?translate("Kết thúc"):origin===undefined?(solo?translate("Đang đồng bộ giờ"):translate("Chờ hai người sẵn sàng")):t< -15000?translate("Đếm ngược"):t<0?translate("Inspection · chỉ x/y/z"):t<=room.durationMs?(loaded===draft.k?`${translate("Đang giải khối ")}${draft.k+1}`:translate("Chờ scramble tiếp theo…")):translate("Hết giờ · đang chốt kết quả");
    frame=requestAnimationFrame(draw);
  };
  const api=async(action:string,extra:Record<string,unknown>={}):Promise<Snapshot>=>{
    const {data:{session:current}}=await client.auth.getSession();
    if(current?.user.id!==user)throw new Error(translate("Phiên hồ sơ đã đổi. Hãy tải lại trang."));
    accessToken=current.access_token;
    const started=performance.now();
    const endpoint=solo?'/api/time-limit':'/api/race';
    const response=await fetch(action==='get'?`${endpoint}?id=${roomId}${!solo?'&client='+connection:''}`:endpoint,{
      method:action==='get'?'GET':'POST',headers:{Authorization:`Bearer ${current.access_token}`,'Content-Type':'application/json'},
      ...(action==='get'?{}:{body:JSON.stringify({id:roomId,action:!solo&&roomId.length===32&&action==='leave'?'forfeit':action,...(!solo?{client:connection,round:room?.round,mode:room?.nextMode??mode.value,...(['ready','rematch'].includes(action)?{stake:room?.stake??0}:{})}:{}),...extra})}),signal:AbortSignal.timeout(8000)});
    const value=await response.json();if(!response.ok)throw new RoomApiError(value.error??translate("Không kết nối được phòng."),response.status);
    const next=value as Snapshot;
    if(!solo&&action==='leave'&&roomId.length===32)next.left=true;
    if(next.round&&next.round!==room?.round)origin=undefined;
    // Establish a monotonic input origin once per page/match. Network polls never
    // move a running clock backwards or rewrite already captured event timestamps.
    if(origin===undefined&&next.startMs!==null)origin=started+(performance.now()-started)/2+(next.startMs+18000-next.serverNow);
    return next;
  };
  const accept=(next:Snapshot)=>{
    const changedRound=!!next.round&&next.round!==room?.round;
    const starting=room?.startMs==null&&next.startMs!==null,ending=!room?.final&&next.final;
    room=next;
    if(changedRound){
      loaded=-1;nextScrambleCheck=0;sentProgress='';scrambles.clear();opponentState='';
      controller.setMoveGate(undefined);controller.reset();controller.lockInput('race');
      renderer.setState(solvedState(3));opponentDisplay=solvedState(3);opponentRenderer?.setState(opponentDisplay);
      draft={k:0,preEvents:[],events:[],pending:[]};
      try{const saved=localStorage.getItem(storageKey());if(saved)draft=readDraft(saved);}catch{/* Invalid/absent draft never leaks into another round. */}
      el('race-result').textContent='';el('scramble-text').textContent=translate("Scramble được mở khi bắt đầu inspection.");
    }
    for(const item of next.scrambles)scrambles.set(item.k,item.moves);
    draft.pending=draft.pending.filter(run=>run.k>next.ack);
    if(draft.k<=next.ack){draft.k=next.ack+1;draft.events=[];draft.preEvents=[];}
    load();save();
    const me=next.players.find(player=>player.id===user),other=next.players.find(player=>player.id!==user);
    const target=solo?({oneFace:translate("1 mặt"),f2lRush:'F2L',fullSolve:'full'} as Record<string,string>)[next.mode]:translate("Bạn");
    if (!solo) {
      applySkin(renderer,me?.skinId);
      if(opponentRenderer)applySkin(opponentRenderer,other?.skinId);
    }
    el('race-own-name').dataset.nameplate=me?.nameplate??'';
    if(!solo)el('race-opponent-name').dataset.nameplate=other?.nameplate??'';
    el('race-own-name').textContent=me?`${me.name} · ${target}`:translate("Bạn");
    if(!solo)el('race-opponent-name').textContent=other?`${other.name}${translate(" · Đối thủ")}`:translate("Đối thủ");
    const view=next.opponent;
    if(opponentRenderer&&view&&Array.isArray(view.state)&&view.state.length===54&&view.state.every(n=>Number.isInteger(n)&&n>=0&&n<=5)){
      const key=`${view.k}:${view.state.join(',')}`;
      if(key!==opponentState){opponentDisplay=Uint8Array.from(view.state);opponentRenderer.setState(opponentDisplay);opponentState=key;}
      el('race-opponent-status').textContent=`${translate("Khối ")}${view.k+1} · ${view.moveCount}${translate(" nước")}${next.final?translate(" · Đã kết thúc"):''}`;
    }else if(!solo)el('race-opponent-status').textContent=other?translate("Chờ inspection để xem Rubik"):translate("Đang chờ đối thủ");
    el('race-players').replaceChildren(...next.players.map(player=>{
      const li=document.createElement('li');
      if(player.nameplate)li.dataset.nameplate=player.nameplate;
      li.textContent=solo?`${player.score.score}${translate(" khối hoàn thành\nMốc cuối: ")}${formatTime(player.score.lastEndT)}${translate("\nNước đã tính: ")}${player.score.totalMoves}`:
        `${player.name}${player.id===user?translate(" (bạn)"):''} · ${player.present===false?translate("Đã rời phòng"):player.rematch?translate("Muốn đấu lại"):player.ready?translate("Sẵn sàng"):translate("Đang chờ")} · ${player.score.score}${translate(" khối · ")}${formatTime(player.score.lastEndT)} · ${player.score.totalMoves}${translate(" nước")}`;
      return li;
    }));
    if(ready)ready.disabled=next.startMs!==null||next.final||!!next.players.find(p=>p.id===user)?.ready;
    if(starting||(changedRound&&next.startMs!==null))el<HTMLDetailsElement>('race-lobby-controls').open=false;
    if(next.final)el<HTMLDetailsElement>('race-lobby-controls').open=true;
    if(forfeit)forfeit.disabled=next.final;if(copy)copy.disabled=false;if(join)join.disabled=true;if(leave)leave.disabled=false;
    if(rematch){rematch.hidden=!next.final;rematch.disabled=!next.round||!next.final||!!me?.rematch||next.players.filter(p=>p.present!==false).length!==2;}
    create.disabled=!solo||!next.final;mode.value=next.nextMode??next.mode;mode.disabled=solo?!next.final:!next.round||!(next.final||next.startMs===null);
    if(solo){create.textContent=next.final?translate("Chơi lượt mới"):translate("Đang chơi");showTarget(next.mode,!next.final);if(starting)board?.select(next.mode);if(ending)board?.refresh();}
    if(stakeSelect&&stakeControls) {
      stakeControls.hidden=next.stake===undefined;
      stakeSelect.value=String(next.stake??0);
      stakeSelect.disabled=next.owner!==user||(!next.final&&next.startMs!==null);
      const escrow=next.escrow;
      el('race-stake-status').textContent=escrow?.state==='locked' ? translate('Đã giữ tiền cược')
        : escrow?.state==='refunded' ? translate('Đã hoàn cược')
        : escrow?.state==='settled' ? translate('Đã chốt tiền cược') : '';
    }
    if(solo) {
      const reward=next.economy?.reward;
      const ticket=next.economy?.ticket;
      el('time-limit-reward').textContent=reward
        ? translate('Thưởng Time Limit')+` · ${reward.cb} CB · ${reward.zn} ZN`
        : ticket==='free_ticket' ? translate('Đã dùng vé miễn phí')
          : ticket==='paid_ticket' ? translate('Đã dùng vé 100 CB')
          : ticket==='practice' ? translate('Lượt luyện tập miễn phí')
          : ticket==='insufficient' ? translate('Thiếu 100 CB. Lượt này chuyển sang luyện tập miễn phí.') : '';
    }
    if(next.final)el('race-result').textContent=solo?(next.abandoned?translate("Đã hủy lượt · không xếp hạng"):`${translate("Đã chốt: ")}${me!.score.score}${translate(" khối · mốc cuối ")}${formatTime(me!.score.lastEndT)}`):next.result==='draw'?translate("Hòa"):next.result?`${translate("Người thắng: ")}${next.players[next.result==='A'?0:1]!.name}`:translate("Phòng đã đóng");
    else el('race-result').textContent=draft.pending.length?`${draft.pending.length}${translate(" khối đang chờ xác nhận")}`:translate("Các khối đã gửi được server xác nhận.");
  };
  const sync=async(action='get',extra:Record<string,unknown>={})=>{
    if(!roomId||disposed||(solo&&room?.final&&action==='get'))return;
    if(busy){
      // Background polling must not consume a ready/forfeit click. Forfeit
      // takes priority if both actions arrive while a request is in flight.
      if(['ready','forfeit','rematch','mode','stake','leave'].includes(action)&&!['forfeit','leave'].includes(queuedAction?.action??''))queuedAction={action,extra};
      if(action!=='get')pendingAction(action);
      return;
    }
    busy=true;
    if(action!=='get')pendingAction(action);
    try{
      const key=`${draft.k}:${draft.preEvents.length}:${draft.events.length}`;
      const publish=!solo&&action==='get'&&room&&!room.final&&!draft.pending.length&&loaded===draft.k&&
        time()>=-15000&&time()<=room.durationMs&&(draft.preEvents.length>0||draft.events.length>0)&&key!==sentProgress;
      const snapshot=await api(publish?'progress':action,publish?{progress:{k:draft.k,preEvents:draft.preEvents.slice(),events:draft.events.slice()}}:extra);
      if(snapshot.gone||snapshot.left){resetRoom();message.textContent=snapshot.left?translate("Đã rời phòng."):translate("Phòng đã đóng vì không còn người ở lại.");return;}
      if(publish)sentProgress=key;
      accept(snapshot);
      while(draft.pending.length&&!room!.final){accept(await api('cube_done',{run:draft.pending[0]}));}
      message.textContent=solo?(room!.final?translate("Lượt đã được server chốt."):translate("Đã kết nối · mỗi khối hoàn thành được server xác nhận.")):room!.final?translate("Trận đã chốt · cả hai bấm Đấu lại để chơi tiếp trong phòng này."):room!.startMs===null?translate("Đã kết nối phòng. Chọn chế độ rồi cả hai bấm Sẵn sàng."):translate("Đã kết nối · tiến độ đối thủ cập nhật mỗi giây.");
    }catch(error){
      if(!solo&&(action==='leave'||(error instanceof RoomApiError&&error.status===404))){
        resetRoom();message.textContent=action==='leave'?translate("Đã rời trên thiết bị này; nếu mất mạng, server sẽ tự hết hiện diện."):translate("Phòng đã đóng. Bạn có thể tạo hoặc vào phòng khác.");return;
      }
      message.textContent=`${error instanceof Error?translate(error.message):translate("Mất kết nối.")}${translate(" Hàng chờ được giữ để thử lại.")}`;
      if(!room){create.disabled=false;mode.disabled=!solo;if(join)join.disabled=false;}
      if(ready&&room)ready.disabled=room.startMs!==null||room.final||!!room.players.find(p=>p.id===user)?.ready;
      if(room&&forfeit)forfeit.disabled=room.final;
      if(room&&stakeSelect){stakeSelect.value=String(room.stake??0);stakeSelect.disabled=room.owner!==user||(!room.final&&room.startMs!==null);}
      if(room&&!solo){mode.disabled=!(room.final||room.startMs===null);if(leave)leave.disabled=false;if(rematch)rematch.disabled=!room.final||!!room.players.find(p=>p.id===user)?.rematch;}
    }
    finally{
      busy=false;
      if(queuedAction){const next=queuedAction;queuedAction=undefined;pendingAction(next.action);queueMicrotask(()=>{void sync(next.action,next.extra);});}
    }
  };
  cleanup.push(controller.onMoveApplied(event=>{
    if(loading||!room)return;
    const t=time(event.t),item={m:event.move,t:t<0?t+15000:t};
    if(t<0)draft.preEvents.push(item);
    else{
      draft.events.push(item);
      if(raceComplete(event.stateAfter,room.mode)){
        if(!readSkinLowFx())championFrame?.celebrate();
        draft.pending.push({k:draft.k,endT:t,preEvents:draft.preEvents,events:draft.events});
        draft.k++;draft.preEvents=[];draft.events=[];save();load();
        if(loaded!==draft.k)controller.lockInput('race');
        void sync();
      }
    }
    save();
  }));
  const enter=async(action:'join'|'create'|'get',id=code?.value.trim()??'')=>{
    if(busy||(room&&!(solo&&room.final)))return;
    roomId=!solo&&id.length===8?id.toUpperCase():id;
    if(!(solo?/^[a-f0-9]{32}$/:/^(?:[A-Z0-9]{8}|[a-f0-9]{32})$/).test(roomId)){message.textContent=solo?translate("Mã lượt không hợp lệ."):translate("Mã phòng gồm 8 chữ hoặc số.");roomId='';return;}
    if(code)code.value=roomId;
    room=undefined;origin=undefined;loaded=-1;nextScrambleCheck=0;sentProgress='';scrambles.clear();
    controller.lockInput('race');controller.reset();el('scramble-text').textContent=translate("Scramble được mở khi bắt đầu inspection.");
    draft={k:0,preEvents:[],events:[],pending:[]};
    try{
      const saved=(solo||roomId.length===32)?localStorage.getItem(storageKey()):null;if(saved)draft=readDraft(saved);
    }catch{message.textContent=translate("Không đọc được tiến độ local; sẽ khôi phục các khối server đã nhận.");}
    await sync(action,{mode:mode.value});
    if(room)history.replaceState(null,'',solo?`/time-limit.html?session=${roomId}`:`/race.html?room=${roomId}`);
  };
  create.onclick=()=>{const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';const id=solo?crypto.randomUUID().replaceAll('-',''):Array.from(crypto.getRandomValues(new Uint8Array(8)),n=>alphabet[n%32]).join('');if(code)code.value=id;create.blur();void enter('create',id);};
  const joinForm=document.querySelector<HTMLFormElement>('#race-join-form');if(joinForm)joinForm.onsubmit=e=>{e.preventDefault();void enter('join');};
  if(ready)ready.onclick=()=>{ready.blur();void sync('ready');};
  if(copy)copy.onclick=()=>{void navigator.clipboard.writeText(`${location.origin}/race.html?room=${roomId}`).then(()=>{message.textContent=translate("Đã sao chép link mời.");},()=>{message.textContent=`${translate("Link mời: ")}${location.origin}/race.html?room=${roomId}`;});};
  if(forfeit)forfeit.onclick=()=>dialog.showModal();if(leave)leave.onclick=()=>dialog.showModal();el('race-keep').onclick=()=>dialog.close();
  el('race-confirm-forfeit').onclick=()=>{dialog.close();void sync(solo?'forfeit':'leave');};
  if(rematch)rematch.onclick=()=>{rematch.blur();void sync('rematch');};
  if(!solo)mode.onchange=()=>{if(room)void sync('mode',{mode:mode.value});};
  if(stakeSelect)stakeSelect.onchange=()=>{if(room)void sync('stake',{stake:Number(stakeSelect.value)});};
  el('race-camera').onclick=()=>renderer.resetCamera();
  if(opponentRenderer)el('race-opponent-camera').onclick=()=>opponentRenderer.resetCamera();
  const speed=document.querySelector<HTMLInputElement>('#race-speed');if(speed)speed.oninput=()=>{renderer.setSpeed(Number(speed.value));el('race-speed-value').textContent=speed.value+' ms';};
  if(solo){
    const space=(e:KeyboardEvent)=>{if(e.code==='Space'&&!e.repeat&&!e.isComposing&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&!e.shiftKey&&!document.querySelector('dialog[open]')&&!e.composedPath().some(t=>t instanceof HTMLElement&&(t.matches('input,textarea,select')||t.isContentEditable))){e.preventDefault();if(!create.disabled)create.click();}};
    window.addEventListener('keydown',space,true);cleanup.push(()=>window.removeEventListener('keydown',space,true));
  }
  message.textContent=(solo?translate("Chọn danh mục rồi bấm Bắt đầu hoặc Space."):translate("Tạo phòng hoặc mở link mời từ bạn."))+(championWarning?' '+championWarning:'');
  if(!solo){
    mode.disabled=true;
    const depart=()=>{if(roomId.length===8&&accessToken)void fetch('/api/race',{method:'POST',headers:{Authorization:'Bearer '+accessToken,'Content-Type':'application/json'},body:JSON.stringify({action:'leave',id:roomId,client:connection,depart:true}),keepalive:true}).catch(()=>{});};
    const returnToPage=(event:PageTransitionEvent)=>{if(event.persisted)location.reload();};
    window.addEventListener('pagehide',depart);window.addEventListener('pageshow',returnToPage);
    cleanup.push(()=>{depart();window.removeEventListener('pagehide',depart);window.removeEventListener('pageshow',returnToPage);});
  }
  const invite=new URLSearchParams(location.search).get(solo?'session':'room');if(invite){if(code)code.value=invite;await enter(solo?'get':'join',invite);}
  const tick=()=>{if(disposed)return;void sync().finally(()=>{if(!disposed)poll=window.setTimeout(tick,1000);});};
  poll=window.setTimeout(tick,1000);draw();
}
void boot().catch(error=>{message.textContent=error instanceof Error?translate(error.message):translate("Không mở được lượt chơi.");create.disabled=true;if(join)join.disabled=true;});
const dispose=()=>{disposed=true;clearTimeout(poll);cancelAnimationFrame(frame);for(const off of cleanup)off();};
window.addEventListener('pagehide',event=>{if(!event.persisted)dispose();});
import.meta.hot?.dispose(dispose);
