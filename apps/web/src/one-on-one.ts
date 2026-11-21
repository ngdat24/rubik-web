import './style.css';
import {t} from './i18n.js';
import {browserAccount} from './account.js';
import {accessUrl} from './auth-client.js';
import {mountWallet} from './wallet.js';
import {mountCommunityChat} from './community-chat.js';
import {CubeController,loadSettings} from '@rubik/controller';
import {CubeRenderer,viewMove} from '@rubik/renderer';
import type {RendererOptions} from '@rubik/renderer';
import {formatTime,solvedState} from '@rubik/engine';
import type {MoveEvent} from '@rubik/engine';
import {attachKeyboard} from './keyboard.js';
import {attachDrag} from './drag.js';
import {bindSkinEffects,skinLayout,skinPalette,skinSurface} from './skin-effects.js';
import type {Appearance} from './skin-effects.js';
import {loadEquippedChampion} from './champion-equipped.js';
import {mountChampionIceTurn} from './champion-ice-turn.js';
import {raceComplete} from '../../../shared/race-rules.mjs';

const modes={twoByTwo:'2×2',fullSolve:'3×3',f2lRush:'F2L',oneFace:t('1 mặt')};
type Mode=keyof typeof modes;
const modeOptions=Object.entries(modes).map(([key,label])=>`<option value="${key}">${label}</option>`).join('');
const numbers=[1,2,3,4,5].map(n=>`<option value="${n}">${n}</option>`).join('');
const toggle=(name:string,title:string,enabled:boolean)=>`<fieldset><legend>${t(title)}</legend>
  <label><input type="radio" name="${name}" value="yes" ${enabled?'checked':''}><span>${t('Có')}</span></label>
  <label><input type="radio" name="${name}" value="no" ${enabled?'':'checked'}><span>${t('Không')}</span></label></fieldset>`;

const main=document.querySelector('main')!;
document.title='Rubik Lab — '+t('Đấu 1v1');
main.querySelectorAll(':scope > :not(header)').forEach(element=>element.remove());
main.insertAdjacentHTML('beforeend',`<div class="duel-layout">
  <div class="duel-main">
    <section class="duel-panel" id="duel-lobby">
      <div class="duel-toolbar">
        <button id="duel-create" type="button" aria-controls="duel-settings" aria-expanded="false" disabled>Tạo phòng</button>
        <form id="duel-join"><label for="duel-code">Nhập mã:</label>
          <input id="duel-code" maxlength="8" pattern="[A-Za-z0-9]{8}" autocomplete="off" autocapitalize="characters" required>
          <button disabled>Vào</button>
        </form>
      </div>
      <div class="duel-prefs">${toggle('opponent-skin','Hiển thị skin đối phương',true)}${toggle('low-graphics','Giảm đồ họa',false)}</div>
      <form id="duel-settings" class="duel-settings" hidden>
        <h2>Cài đặt phòng</h2>
        <label>Mode <select id="duel-mode">${modeOptions}</select></label>
        <label>Số ván <select id="duel-limit">${numbers}</select></label>
        <label>Thời gian mỗi ván <select id="duel-duration">${numbers}</select> phút</label>
        <label>Cược <select id="duel-currency"><option value="">Không cược</option><option>CB</option><option>ZN</option></select></label>
        <label id="duel-stake-label" hidden>Mức cược mỗi người <select id="duel-stake"></select></label>
        <button>Lưu</button>
      </form>
    </section>
    <section id="duel-room" hidden>
      <div class="duel-panel">
        <div class="duel-toolbar">
          <strong id="duel-room-code"></strong><button id="duel-copy" type="button" aria-label="Sao chép mã phòng">Sao chép</button>
          <button id="duel-ready" type="button">Sẵn sàng</button><button id="duel-rematch" type="button" hidden>Đấu lại</button>
          <button id="duel-leave" type="button">Thoát</button>
        </div>
        <div class="duel-info">
          <label>Chế độ <select id="duel-next-mode">${modeOptions}</select></label>
          <strong id="duel-score" class="duel-score"></strong>
        </div>
        <p id="duel-match-info"></p><ol id="duel-round-results" class="duel-rounds"></ol>
      </div>
      <div class="duel-panel">
        <div class="duel-cube-header">
          <strong id="duel-own-name">Bạn</strong>
          <span id="duel-scramble" aria-label="Scramble" hidden></span>
          <output id="duel-clock" class="duel-clock">—</output>
        </div>
        <div class="duel-cube" id="duel-cube" aria-label="Rubik của bạn"></div>
        <button id="duel-forfeit" type="button" hidden>Bỏ cuộc</button>
      </div>
    </section>
    <p id="duel-status" role="status"></p>
    <a id="duel-login" hidden>Đăng nhập Google để chơi 1v1</a>
  </div>
  <div class="duel-side">
    <div class="shared-community-chat" data-community-chat></div>
    <section class="duel-panel" id="duel-opponent-panel" hidden>
      <h2 id="duel-opponent-name">Đối thủ</h2>
      <div id="duel-opponent" class="duel-opponent" aria-label="Rubik đối thủ"></div>
    </section>
  </div>
</div>
<dialog id="duel-exit-dialog"><form method="dialog"><h2>Thoát phòng?</h2>
  <p>Thoát giữa trận sẽ tính thua cả trận.</p><button value="cancel">Ở lại</button><button value="leave">Thoát phòng</button>
</form></dialog>`);
const copyWalker=document.createTreeWalker(main,NodeFilter.SHOW_TEXT);
while(copyWalker.nextNode()){
  const node=copyWalker.currentNode;
  const raw=node.textContent??'', copy=raw.trim();
  if(copy&&!node.parentElement?.closest('header'))node.textContent=raw.replace(copy,t(copy));
}
for(const label of main.querySelectorAll<HTMLElement>('.duel-layout [aria-label]')){
  label.setAttribute('aria-label',t(label.getAttribute('aria-label')??''));
}

const el=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
const button=(id:string)=>el<HTMLButtonElement>(id);
const select=(id:string)=>el<HTMLSelectElement>(id);
const form=(id:string)=>el<HTMLFormElement>(id);
const status=el('duel-status');
const invite=new URLSearchParams(location.search).get('match');
const format=(milliseconds:number|null)=>milliseconds===null?'X':formatTime(milliseconds);

function reduceGraphics(options:RendererOptions):RendererOptions {
  const reduced={...options,optimize:true};
  const surface=options.surface;
  if(surface){
    const {pulse:_pulse,glow:_glow,...staticSurface}=surface;
    if(staticSurface.stickers){
      const {normalMap:_normal,normalAtlases:_normalTiles,aoMap:_ao,roughnessMap:_roughness,
        centerBumpMap:_bump,centerMetalnessMap:_metalness,centerRoughnessMap:_centerRoughness,...stickers}=staticSurface.stickers;
      staticSurface.stickers=stickers;
    }
    reduced.surface=staticSurface;
  }
  return reduced;
}

interface Run {k:0;endT:number;preEvents:MoveEvent[];events:MoveEvent[]}
interface Draft {preEvents:MoveEvent[];events:MoveEvent[];pending?:Run}
interface Player {id:string;name:string;ready:boolean;rematch?:boolean;departed?:boolean;skinId?:string;score:{score:number}}
interface Snapshot {
  id:string;round:string;mode:Mode;nextMode:Mode;size:2|3;roundLimit:number;durationMs:number;serverNow:number;startMs:number|null;
  final:boolean;matchFinal:boolean;matchWinner:string|null;owner:string;stake:number;currency:'CB'|'ZN'|null;locked:boolean;
  rounds:{mode:Mode;winner:string|null;a:number|null;b:number|null}[];players:Player[];ownOutcome:'solved'|'forfeit'|null;
  opponent:{state:number[]}|null;scrambles:{moves:string[]}[];ack:number;gone?:boolean;left?:boolean;
}

function preferences(){
  const keys=['opponent-skin','low-graphics'] as const;
  const values=keys.map(key=>{
    const controls=document.querySelectorAll<HTMLInputElement>(`[name=${key}]`);
    try {
      const stored=localStorage.getItem('rubik.duel.'+key);
      if(stored)for(const control of controls)control.checked=control.value===stored;
      for(const control of controls)control.onchange=()=>localStorage.setItem('rubik.duel.'+key,control.value);
    }catch{/* Optional settings storage. */}
    return ()=>controls[0]!.checked;
  });
  return {showOpponent:values[0]!,lowGraphics:values[1]!};
}

async function boot(){
  const prefs=preferences();
  const accountReady=browserAccount(false).catch(()=>undefined);
  const disposeChat=mountCommunityChat(accountReady);
  const candidate=await accountReady;
  window.addEventListener('pagehide',event=>{if(!event.persisted)disposeChat();});
  if(!candidate){
    const login=el<HTMLAnchorElement>('duel-login');
    login.href=accessUrl();login.hidden=false;
    button('duel-create').disabled=true;
    form('duel-join').querySelector('button')!.disabled=true;
    return;
  }
  const account=candidate;
  const wallet=mountWallet(account);
  const settings=form('duel-settings');
  const create=button('duel-create');
  create.onclick=()=>{
    settings.hidden=!settings.hidden;create.setAttribute('aria-expanded',String(!settings.hidden));
    if(!settings.hidden){
      if(!matchMedia('(prefers-reduced-motion: reduce)').matches)settings.animate([{opacity:0,transform:'translateY(-8px)'},{opacity:1,transform:'none'}],{duration:200});
      select('duel-mode').focus();
    }
  };
  select('duel-currency').onchange=()=>{
    const currency=select('duel-currency').value;
    el('duel-stake-label').hidden=!currency;
    select('duel-stake').replaceChildren(...(currency==='CB'?[100,200,300,500]:[1,2]).map(n=>new Option(n+' '+currency,String(n))));
  };

  let room:Snapshot|undefined, code='', origin:number|undefined, rendered='', busy=false, draft:Draft={preEvents:[],events:[]};
  let waitingForRematch=false;
  let accessToken='';
  let renderer:CubeRenderer|undefined, opponent:CubeRenderer|undefined, controller:CubeController|undefined;
  let effects:ReturnType<typeof bindSkinEffects>|undefined, disposed=false, frame=0, lastProgress='', opponentState='';
  let disposeChampionIce:(()=>void)|undefined;
  let graphicsKey='', loading=false, pendingAction:()=>void=()=>{};
  const detachers:(()=>void)[]=[];
  const appearanceCache=new Map<string,Promise<Appearance>>();
  const prefKey=(room:Snapshot)=>`rubik.duel.${account.id}.${room.id}.${room.round}`;
  const save=()=>{if(room)try{localStorage.setItem(prefKey(room),JSON.stringify(draft));}catch{/* Continue in memory. */}};
  const elapsed=(stamp=performance.now())=>origin===undefined?-18001:Math.floor(stamp-origin);
  const canMove=(s:Snapshot,t:number)=>!s.final&&!s.ownOutcome&&!draft.pending&&t>=-15000&&t<=s.durationMs;
  const getAppearance=(id?:string)=>{
    if(!id)return;
    let pending=appearanceCache.get(id);
    if(!pending){
      pending=fetch('/api/skin-appearance?id='+encodeURIComponent(id),{signal:AbortSignal.timeout(10000)})
        .then(async r=>{if(!r.ok)throw new Error();return (await r.json()).appearance as Appearance;})
        .catch(error=>{appearanceCache.delete(id);throw error;});
      appearanceCache.set(id,pending);
    }
    return pending;
  };
  const mountCubes=(size:2|3)=>{
    if(controller){
      controller.setSize(size);opponent!.setSize(size);opponent!.setState(solvedState(size));return;
    }
    renderer=new CubeRenderer(el('duel-cube'),{optimize:prefs.lowGraphics()});
    renderer.setSpeed(40);
    opponent=new CubeRenderer(el('duel-opponent'),{optimize:prefs.lowGraphics()});
    opponent.setSize(size);opponent.setState(solvedState(size));
    controller=new CubeController(renderer,size);controller.lockInput('race');
    renderer.onMoveAnimated=()=>effects?.play();
    const bindings=loadSettings(()=>localStorage).settings;
    detachers.push(attachKeyboard(controller,()=>{},()=>bindings.profiles[bindings.activeProfile]!.bindings,move=>viewMove(move,renderer!.getViewFaces())));
    detachers.push(attachDrag(renderer,controller,()=>{}));
    controller.setMoveGate((move,stamp)=>{
      const time=elapsed(stamp);
      return !!room&&rendered===room.round&&canMove(room,time)&&
        (time<0 ? move.type==='rotation'&&draft.preEvents.length<200 : draft.events.length<4000);
    });
    detachers.push(controller.onMoveApplied(event=>{
      if(!room||loading)return;
      const time=elapsed(event.t);
      const item={m:event.move,t:time<0?time+15000:time};
      if(time<0)draft.preEvents.push(item);
      else{
        draft.events.push(item);
        if(raceComplete(event.stateAfter,room.mode)){
          draft.pending={k:0,endT:time,preEvents:draft.preEvents,events:draft.events};
          controller!.lockInput('race');
          void poll();
        }
      }
      save();
    }));
  };
  const refreshGraphics=async(s:Snapshot)=>{
    const own=s.players.find(p=>p.id===account.id)?.skinId;
    const other=prefs.showOpponent()?s.players.find(p=>p.id!==account.id)?.skinId:undefined;
    const key=[s.size,own,other,prefs.lowGraphics()].join(':');
    if(graphicsKey===key)return;
    graphicsKey=key;
    try{
      const [mine,theirs,champion]=await Promise.allSettled([getAppearance(own),getAppearance(other),loadEquippedChampion(account,s.size)]);
      if(disposed||graphicsKey!==key||!renderer||!controller||!opponent)return;
      const reduced=prefs.lowGraphics();
      const look=(appearance:Appearance|undefined)=>{
        const surface=skinSurface(appearance);
        return {...skinLayout(appearance),theme:skinPalette(appearance),...(surface?{surface}:{})};
      };
      const ownChampion=champion.status==='fulfilled'?champion.value:undefined;
      const quality=(options:RendererOptions)=>reduced?reduceGraphics(options):options;
      if(ownChampion||mine.status==='fulfilled'){
        const appearance=mine.status==='fulfilled'?mine.value:undefined;
        renderer.setAppearance(quality(ownChampion?.options??look(appearance)),controller.cube.state);
        effects?.dispose();
        effects=appearance&&!reduced&&!ownChampion?bindSkinEffects(renderer,appearance):undefined;
        disposeChampionIce?.();
        disposeChampionIce=ownChampion&&s.size===2&&!reduced?mountChampionIceTurn(renderer,()=>!prefs.lowGraphics()):undefined;
      }
      if(theirs.status==='fulfilled'){
        const state=room?.opponent?.state;
        opponent.setAppearance(quality(look(theirs.value)),state?.length===6*s.size*s.size?Uint8Array.from(state):solvedState(s.size));
      }
      if((!ownChampion&&mine.status==='rejected')||theirs.status==='rejected')graphicsKey='';
    }catch{if(graphicsKey===key)graphicsKey='';}
  };
  function paint(s:Snapshot){
    const previous=room;
    room=s;
    el('duel-lobby').hidden=true;el('duel-room').hidden=false;el('duel-opponent-panel').hidden=false;
    if(previous?.round!==s.round){
      mountCubes(s.size);
      rendered='';lastProgress='';opponentState='';graphicsKey='';
      draft={preEvents:[],events:[]};
      try {
        const stored=JSON.parse(localStorage.getItem(prefKey(s))??'null') as Draft|null;
        if(stored&&Array.isArray(stored.preEvents)&&Array.isArray(stored.events))draft=stored;
      }catch{/* Fresh round. */}
    }
    if(s.ack>=0||s.final)delete draft.pending;
    const scramble=s.scrambles[0]?.moves;
    if(scramble&&rendered!==s.round){
      loading=true;
      controller!.setMoveGate(undefined);
      controller!.unlockInput('race');
      controller!.reset();
      controller!.sequence([...scramble,...draft.preEvents.map(e=>e.m),...draft.events.map(e=>e.m)].join(' '),0);
      renderer!.setState(controller!.cube.state);
      loading=false;
      rendered=s.round;
      controller!.setMoveGate((move,stamp)=>{
        const time=elapsed(stamp);
        return !!room&&canMove(room,time)&&(time<0?move.type==='rotation'&&draft.preEvents.length<200:draft.events.length<4000);
      });
    }
    if(s.opponent?.state.length===6*s.size*s.size){
      const key=s.opponent.state.join(',');
      if(opponentState!==key){
        opponent!.setState(Uint8Array.from(s.opponent.state));opponentState=key;
      }
    }
    void refreshGraphics(s);
    const own=s.players.find(p=>p.id===account.id),other=s.players.find(p=>p.id!==account.id);
    waitingForRematch=Boolean(s.matchFinal&&own?.rematch&&other&&!other.departed);
    el('duel-room-code').textContent=t('Mã: ')+s.id;
    el('duel-score').textContent=`${t('Bạn')} ${own?.score.score??0} : ${other?.score.score??0} ${t('Đối thủ')}`;
    el('duel-own-name').textContent=own?.name??t('Bạn');
    el('duel-opponent-name').textContent=other?.name??t('Đang chờ đối thủ');
    const scrambleLabel=el('duel-scramble');
    scrambleLabel.textContent=scramble?.join(' ')??'';
    scrambleLabel.hidden=!scramble?.length||rendered!==s.round;
    const round=Math.min(s.roundLimit,s.rounds.length+(s.final||s.matchFinal?0:1));
    el('duel-match-info').textContent=`${t('Ván')} ${Math.max(1,round)}/${s.roundLimit} · ${s.durationMs/60000} ${t('phút/ván')} · ${s.currency?s.stake+' '+s.currency+' '+t('mỗi người'):t('Không cược')}`;
    const first=s.players[0]?.id===account.id;
    el('duel-round-results').replaceChildren(...s.rounds.map(result=>{
      const line=document.createElement('li');
      const winner=t(result.winner===null?'Hòa':result.winner===account.id?'Thắng':'Thua');
      line.textContent=`${modes[result.mode]} · ${format(first?result.a:result.b)} : ${format(first?result.b:result.a)} · ${winner}`;
      return line;
    }));
    select('duel-next-mode').value=s.nextMode;
    button('duel-ready').hidden=s.matchFinal||s.startMs!==null&&!s.final;
    button('duel-ready').disabled=!!own?.ready||!other;
    button('duel-rematch').hidden=!s.matchFinal;
    button('duel-rematch').disabled=!!own?.rematch||!other||!!other.departed;
    button('duel-forfeit').hidden=s.startMs===null||s.final||!!s.ownOutcome||!!draft.pending;
    if(s.matchFinal)status.textContent=t(s.matchWinner===null?'Trận hòa':s.matchWinner===account.id?'Bạn thắng trận':'Bạn thua trận');
    else if(s.final)status.textContent=t('Ván đã kết thúc. Hai người bấm Sẵn sàng để chơi tiếp.');
    else if(s.startMs===null)status.textContent=t(other?'Hai người bấm Sẵn sàng để bắt đầu.':'Gửi mã phòng cho đối thủ.');
    else status.textContent=t(s.ownOutcome==='solved'?'Đã giải xong. Đang chờ đối thủ.':s.ownOutcome==='forfeit'?'Bạn đã bỏ cuộc ở ván này.':'');
    save();
  }
  async function call(action:string,extra:Record<string,unknown>={}){
    const started=performance.now();
    accessToken=await account.token();
    const response=await fetch(action==='get'?`/api/race-match?id=${code}`:'/api/race-match',{
      method:action==='get'?'GET':'POST',headers:{Authorization:'Bearer '+accessToken,'Content-Type':'application/json'},
      ...(action==='get'?{}:{body:JSON.stringify({id:code,action,round:room?.round,mode:room?.nextMode,...extra})}),
      signal:AbortSignal.timeout(9000)
    });
    const data=await response.json();
    if(!response.ok)throw new Error(data.error??'Không kết nối được phòng.');
    const next=data as Snapshot;
    if(next.gone||next.left){
      room=undefined;code='';origin=undefined;
      waitingForRematch=false;
      el('duel-lobby').hidden=false;el('duel-room').hidden=true;el('duel-opponent-panel').hidden=true;
      history.replaceState(null,'',location.pathname);
      status.textContent=t(next.left?'Đã rời phòng.':'Phòng đã đóng.');
      return;
    }
    if(next.round!==room?.round||origin===undefined)origin=next.startMs===null?undefined:started+(performance.now()-started)/2+next.startMs+18000-next.serverNow;
    paint(next);
  }
  async function poll(action='get',extra:Record<string,unknown>={}){
    if(!code||disposed||(action==='get'&&room?.matchFinal&&!waitingForRematch))return;
    if(busy){
      if(action!=='get')pendingAction=()=>{void poll(action,extra);};
      return;
    }
    busy=true;
    // Keep checking if the rematch response is lost after the server accepts it.
    if(action==='rematch')waitingForRematch=true;
    try{
      if(action==='get'&&draft.pending&&room&&!room.final)await call('cube_done',{run:draft.pending});
      else if(action==='get'&&room&&rendered===room.round&&canMove(room,elapsed())){
        const key=draft.preEvents.length+':'+draft.events.length;
        if(key!=='0:0'&&key!==lastProgress){
          await call('progress',{progress:{k:0,preEvents:draft.preEvents,events:draft.events}});
          lastProgress=key;
        }else await call('get');
      }else await call(action,extra);
    }catch(error){
      status.textContent=error instanceof Error?t(error.message):'Mất kết nối. Đồng hồ vẫn chạy.';
      if(action==='get'&&draft.pending&&room&&elapsed()>room.durationMs+3000){
        delete draft.pending;save();
      }
    }finally{
      busy=false;
      const next=pendingAction;pendingAction=()=>{};next();
    }
  }
  async function ensureName(){
    const headers={Authorization:'Bearer '+await account.token(),'Content-Type':'application/json'};
    const response=await fetch('/api/player',{headers,signal:AbortSignal.timeout(9000)});
    if(!response.ok)throw new Error('Không tải được tên hiển thị.');
    if((await response.json()).name)return;
    const dialog=el<HTMLDialogElement>('race-name-dialog'), nameForm=form('race-name-form');
    await new Promise<void>(resolve=>{
      nameForm.onsubmit=async event=>{
        event.preventDefault();
        const submit=nameForm.querySelector('button')!;submit.disabled=true;
        try{
          const response=await fetch('/api/player',{method:'POST',headers,body:JSON.stringify({name:el<HTMLInputElement>('race-name').value}),signal:AbortSignal.timeout(9000)});
          if(!response.ok)throw new Error((await response.json()).error);
          dialog.close();resolve();
        }catch(error){el('race-name-error').textContent=error instanceof Error?error.message:'Không lưu được tên.';}
        finally{submit.disabled=false;}
      };
      dialog.oncancel=event=>event.preventDefault();dialog.showModal();
    });
  }
  let entering=false;
  async function enter(action:'create'|'join',id:string,extra:Record<string,unknown>={}){
    if(entering||room)return;
    if(!/^[A-Z0-9]{8}$/.test(id)){status.textContent='Mã phòng gồm 8 ký tự.';return;}
    entering=true;
    try{
      await ensureName();
      code=id;await poll(action,extra);
      if(room){
        const url=new URL(location.href);url.searchParams.set('match',id);history.replaceState(null,'',url);
      }else code='';
    }catch(error){status.textContent=error instanceof Error?error.message:'Không vào được phòng.';}
    finally{entering=false;}
  }
  form('duel-join').onsubmit=event=>{event.preventDefault();void enter('join',el<HTMLInputElement>('duel-code').value.trim().toUpperCase());};
  settings.onsubmit=event=>{
    event.preventDefault();
    const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const id=Array.from(crypto.getRandomValues(new Uint8Array(8)),n=>alphabet[n%32]).join('');
    const currency=select('duel-currency').value||null;
    void enter('create',id,{mode:select('duel-mode').value,roundLimit:Number(select('duel-limit').value),
      durationMs:Number(select('duel-duration').value)*60000,currency,stake:currency?Number(select('duel-stake').value):0});
  };
  button('duel-copy').onclick=()=>{if(code)void navigator.clipboard.writeText(code).then(
    ()=>{status.textContent=t('Đã sao chép mã phòng.');},()=>{status.textContent=t('Mã phòng: ')+code;});};
  button('duel-ready').onclick=()=>{void poll('ready');};
  button('duel-rematch').onclick=()=>{void poll('rematch');};
  button('duel-forfeit').onclick=()=>{void poll('forfeit');};
  select('duel-next-mode').onchange=()=>{void poll('mode',{mode:select('duel-next-mode').value});};
  const exit=el<HTMLDialogElement>('duel-exit-dialog');
  button('duel-leave').onclick=()=>{exit.returnValue='';exit.showModal();};
  exit.onclose=()=>{if(exit.returnValue==='leave')void poll('leave');};
  create.disabled=false;
  form('duel-join').querySelector('button')!.disabled=false;
  function draw(){
    if(disposed)return;
    const time=elapsed(),s=room;
    if(s){
      button('duel-forfeit').hidden=s.startMs===null||s.final||!!s.ownOutcome||!!draft.pending||time>=s.durationMs;
      select('duel-next-mode').disabled=s.owner!==account.id||(s.startMs!==null&&!s.final&&time>=0);
    }
    if(s&&rendered===s.round&&canMove(s,time))controller?.unlockInput('race');
    else controller?.lockInput('race');
    el('duel-clock').textContent=!s||origin===undefined?'—':s.final?t('Kết thúc'):time< -15000?`${t('Bắt đầu sau')} ${Math.ceil((-15000-time)/1000)}`:time<0?`Inspection ${Math.ceil(-time/1000)}`:formatTime(Math.max(0,s.durationMs-time));
    frame=requestAnimationFrame(draw);
  }
  if(invite)void enter('join',invite.toUpperCase());
  const timer=setInterval(()=>{if(!entering)void poll();},1000);
  draw();
  window.addEventListener('pagehide',event=>{
    if(room?.owner===account.id&&code&&accessToken){
      void fetch('/api/race-match',{
        method:'POST',headers:{Authorization:'Bearer '+accessToken,'Content-Type':'application/json'},
        body:JSON.stringify({id:code,action:'leave'}),keepalive:true
      }).catch(()=>{/* An unreachable server still expires inactive rooms. */});
    }
    if(event.persisted)return;
    disposed=true;clearInterval(timer);cancelAnimationFrame(frame);
    for(const detach of detachers)detach();
    effects?.dispose();disposeChampionIce?.();controller?.dispose();opponent?.dispose();wallet.dispose();account.dispose();
  });
}

void boot().catch(error=>{status.textContent=error instanceof Error?error.message:'Không mở được 1v1.';});
