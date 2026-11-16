import {randomBytes} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';

/** In-memory RPC double; real SQL invariants are tested separately in rollback. */
export function lobbyAction(lobbies,profiles,{p_code:id,p_user:user,p_action:action,p_payload:payload},now){
  const fail=message=>{throw new Error(message);};
  const fresh=()=>randomBytes(16).toString('hex');
  const participant=()=>({id:user,name:profiles.get(user)?.name,client:payload.client,present:true,until:now+90000,ready:false,rematch:false,runs:[]});
  if(action==='create'){
    for(const [key,value] of lobbies)if(value.expires_ms<=now)lobbies.delete(key);
    if(!profiles.has(user))fail('Set your player name first');
    if(!lobbies.has(id))lobbies.set(id,{id,owner_id:user,mode:payload.mode,next_mode:payload.mode,seed:payload.seed,round_id:fresh(),duration_ms:180000,start_ms:null,forfeit:null,players:[participant()],expires_ms:now+90000});
  }
  const stored=lobbies.get(id);if(!stored)fail('Room not found');
  const room=structuredClone(stored);
  for(const p of room.players)if(p.present&&p.until<=now){p.present=false;p.ready=false;p.rematch=false;if(room.start_ms!==null&&p.until<room.start_ms+201000&&!room.forfeit)room.forfeit=p.id;}
  if(!room.players.some(p=>p.present)){lobbies.delete(id);return {gone:true,now_ms:now};}
  let me=room.players.find(p=>p.id===user),reset=false;
  const finished=()=>!!room.forfeit||(room.start_ms!==null&&now>=room.start_ms+201000);
  if(action==='create'&&(room.owner_id!==user||room.players[0].client!==payload.client))fail('Room code collision');
  if(action==='join'&&!me?.present){
    if(room.players.filter(p=>p.present).length>=2)fail('Room full');
    if(room.start_ms!==null&&!finished())fail('Round running');
    if(!profiles.has(user))fail('Set your player name first');
    room.players=room.players.filter(p=>p.present);me=participant();room.players.push(me);reset=true;
  }
  if(!me?.present)fail('Not a room member');
  if(action==='join')me.client=payload.client;
  if(me.client!==payload.client){if(action==='leave')return {room,now_ms:now};fail('Connection replaced');}
  if(!['create','join','get','leave'].includes(action)&&payload.round!==room.round_id)fail('Round changed');
  me.until=now+90000;
  if(action==='leave'){
    if(payload.depart)me.until=now+5000;
    else{me.present=false;me.ready=false;me.rematch=false;if(room.start_ms!==null&&!finished())room.forfeit=user;}
  }else if(action==='mode'){
    if(room.start_ms!==null&&!finished())fail('Round running');
    if(!['fullSolve','f2lRush','oneFace'].includes(payload.mode))fail('Invalid mode');
    if(payload.mode!==room.next_mode){room.next_mode=payload.mode;for(const p of room.players){p.ready=false;p.rematch=false;}if(room.start_ms===null)reset=true;}
  }else if(action==='ready'){
    if(room.start_ms!==null||room.forfeit||payload.mode!==room.mode)fail('Round changed');
    me.ready=true;if(room.players.length===2&&room.players.every(p=>p.present&&p.ready))room.start_ms=now;
  }else if(action==='rematch'){
    if(!finished()||payload.mode!==room.next_mode)fail('Round changed');
    me.rematch=true;if(room.players.length===2&&room.players.every(p=>p.present&&p.rematch)){reset=true;room.start_ms=now;}
  }else if(action==='cube_done'){
    const run=payload.run,old=me.runs[run.k];
    if(old){if(!isDeepStrictEqual(old,run))fail('Conflict');}
    else{if(run.k!==me.runs.length||room.forfeit||room.start_ms===null||now<room.start_ms+18000||now>=room.start_ms+201000||run.endT>Math.min(180000,now-room.start_ms-18000+250))fail('Late result');me.runs.push(run);}
  }else if(action==='progress'){
    const live=payload.live,old=me.live;
    if(live.k===me.runs.length&&!room.forfeit&&room.start_ms!==null&&now>=room.start_ms+3000&&now<room.start_ms+198000){
      if(!old||old.k!==live.k||(live.preCount>=old.preCount&&live.moveCount>=old.moveCount)){
        if(old?.k===live.k&&old.preCount===live.preCount&&old.moveCount===live.moveCount&&!isDeepStrictEqual(old.state,live.state))fail('Conflicting progress');
        me.live={...live,updatedAt:now};
      }
    }
  }
  if(reset){room.round_id=fresh();room.mode=room.next_mode;room.seed=payload.seed;room.forfeit=null;if(action!=='rematch')room.start_ms=null;for(const p of room.players){p.runs=[];p.ready=action==='rematch';p.rematch=false;delete p.live;}}
  if(!room.players.some(p=>p.present)){lobbies.delete(id);return {gone:true,now_ms:now};}
  room.expires_ms=Math.max(...room.players.filter(p=>p.present).map(p=>p.until));lobbies.set(id,room);
  return {room,now_ms:now};
}
