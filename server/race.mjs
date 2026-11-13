import {randomBytes} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {Cube,matchScrambleAt,isSolved,f2lSolvedAny,parseMove,scoreRun,compare} from '../packages/engine/dist/index.js';

export const raceComplete=(state,mode)=>mode==='fullSolve'?isSolved(state,3):f2lSolvedAny(state);
export function verifyRaceCube(room, player, value, now){
  if(!value||!Number.isSafeInteger(value.k)||value.k<0||value.k>999)throw new Error('Chỉ số khối không hợp lệ.');
  const k=value.k,previous=player.runs[k-1],startT=k===0?0:previous?.endT;
  if(startT===undefined||!Array.isArray(value.events)||!value.events.length||value.events.length>4000||!Array.isArray(value.preEvents)||value.preEvents.length>200)throw new Error('Chuỗi nước không hợp lệ hoặc sai thứ tự khối.');
  const cube=new Cube(3).applyMoves(matchScrambleAt(room.seed,3,k,1));
  const read=(events,pre)=>{
    let last=pre?0:startT;
    return events.map((event,i)=>{
      if(!event||!Number.isSafeInteger(event.t)||event.t<last||event.t>(pre?15000:room.duration_ms)||typeof event.m!=='string'||event.m.length>12)throw new Error('Timestamp không hợp lệ.');
      const move=parseMove(event.m,3);
      if(pre&&(k!==0||move.type!=='rotation'))throw new Error('Inspection chỉ cho phép x/y/z trên khối đầu.');
      last=event.t;cube.applyMove(move);
      if(!pre&&raceComplete(cube.state,room.mode)&&i!==events.length-1)throw new Error('Có nước sau khi đã hoàn thành khối.');
      return {m:move.canonical,t:event.t};
    });
  };
  const preEvents=read(value.preEvents,true),events=read(value.events,false),endT=events.at(-1).t;
  const run={k,startT,endT,preEvents,events,result:room.mode==='fullSolve'?'solved':'f2l'};
  if(k<player.runs.length){
    if(endT!==value.endT||!isDeepStrictEqual(player.runs[k],run))throw new Error('Kết quả gửi lại khác bản đã xác nhận.');
    return run;
  }
  if(endT!==value.endT||!raceComplete(cube.state,room.mode)||!room.start_ms||now>=room.start_ms+21000+room.duration_ms||endT>now-(room.start_ms+18000)+250)throw new Error('Khối chưa hoàn thành, quá giờ hoặc thời gian ở tương lai.');
  return run;
}

export function publicRace(room,user,now){
  const players=room.players,me=players.find(p=>p.id===user);
  if(!me)throw new Error('Bạn không thuộc phòng này.');
  const elapsed=room.start_ms===null?-1:now-room.start_ms;
  const phase=room.forfeit||elapsed>=18000+room.duration_ms?'ended':elapsed<0?'lobby':elapsed<3000?'countdown':elapsed<18000?'inspecting':'running';
  const final=!!room.forfeit||elapsed>=21000+room.duration_ms;
  const scores=players.map(p=>scoreRun(p.runs,{mode:room.mode,size:3,durationMs:room.duration_ms}));
  const result=final&&players.length===2?(room.forfeit?(players[0].id===room.forfeit?'B':'A'):compare(scores[0],scores[1])):null;
  const k=me.runs.length;
  return {id:room.id,mode:room.mode,durationMs:room.duration_ms,serverNow:now,startMs:room.start_ms,phase,final,result,
    players:players.map((p,i)=>({id:p.id,name:p.name,ready:p.ready,score:scores[i]})),
    ack:k-1, runs:me.runs,
    scrambles:room.start_ms!==null&&elapsed>=3000&&!final?Array.from({length:3},(_,i)=>({k:k+i,moves:matchScrambleAt(room.seed,3,k+i,1)})):[]};
}

export async function handleRace({request,user,method,body,url}){
  const action=method==='GET'?'get':body.action;
  const id=method==='GET'?url.searchParams.get('id'):body.id;
  if(!['create','join','ready','get','cube_done','forfeit'].includes(action)||typeof id!=='string'||!/^[a-f0-9]{32}$/.test(id))throw new Error('Phòng hoặc thao tác không hợp lệ.');
  const rpc=async(action,payload={})=>request('/rest/v1/rpc/race_action',{method:'POST',body:{p_user:user.id,p_id:id,p_action:action,p_payload:payload}});
  let snapshot;
  if(action==='cube_done'){
    const before=await rpc('get'),player=before.room.players.find(p=>p.id===user.id);
    const run=verifyRaceCube(before.room,player,body.run,before.now_ms);
    snapshot=await rpc(action,{run});
  }else snapshot=await rpc(action,action==='create'?{seed:randomBytes(32).toString('hex'),mode:body.mode}:{});
  return publicRace(snapshot.room,user.id,snapshot.now_ms);
}
