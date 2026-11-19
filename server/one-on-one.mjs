import {randomBytes} from 'node:crypto';
import {Cube} from '../packages/engine/dist/index.js';
import {raceScramble} from '../shared/race-rules.mjs';
import {verifyRaceCube,verifyRaceProgress} from './race.mjs';

const modes=['twoByTwo','fullSolve','f2lRush','oneFace'];
const actions=['create','join','get','mode','ready','rematch','forfeit','leave','progress','cube_done'];

export async function handleOneOnOne({request,user,method,body,url}){
  const action=method==='GET'?'get':body.action;
  const id=(method==='GET'?url.searchParams.get('id'):body.id);
  if(typeof id!=='string'||!/^[A-Z0-9]{8}$/.test(id)||!actions.includes(action))throw new Error('Mã phòng hoặc thao tác không hợp lệ.');
  if(['create','mode','ready'].includes(action)&&!modes.includes(body.mode))throw new Error('Chế độ không hợp lệ.');
  if(!['create','join','get','leave'].includes(action)&&!/^[a-f0-9]{32}$/.test(body.round??''))throw new Error('Ván đấu không hợp lệ.');
  if(action==='create'){
    const validStake=body.currency===null&&body.stake===0||
      body.currency==='CB'&&[100,200,300,500].includes(body.stake)||
      body.currency==='ZN'&&[1,2].includes(body.stake);
    if(!Number.isInteger(body.roundLimit)||body.roundLimit<1||body.roundLimit>5||
      ![60000,120000,180000,240000,300000].includes(body.durationMs)||!validStake)throw new Error('Cài đặt phòng không hợp lệ.');
  }
  const rpc=(action,extra={})=>request('/rest/v1/rpc/one_on_one_action',{method:'POST',body:{
    p_user:user.id,p_code:id,p_action:action,p_payload:{round:body.round,...extra}
  }});
  let snapshot;
  if(action==='cube_done'||action==='progress'){
    const before=await rpc('get');
    if(before.gone)return before;
    const room=before.room,player=room.players.find(p=>p.id===user.id);
    if(room.round_id!==body.round)throw new Error('Ván đã đổi. Hãy tải lại phòng.');
    if(action==='cube_done'){
      if(body.run?.k!==0)throw new Error('Mỗi ván chỉ tính một khối.');
      snapshot=await rpc(action,{run:verifyRaceCube(room,player,body.run,before.now_ms)});
    }else{
      const live=verifyRaceProgress(room,player,body.progress,before.now_ms);
      snapshot=live?await rpc(action,{live}):before;
    }
  }else snapshot=await rpc(action,{
    mode:body.mode,roundLimit:body.roundLimit,durationMs:body.durationMs,currency:body.currency,stake:body.stake,
    ...(['create','ready','mode'].includes(action)?{seed:randomBytes(32).toString('hex')}:{}),
  });
  if(snapshot.gone)return snapshot;
  const {room,now_ms:now,skins}=snapshot;
  const me=room.players.find(p=>p.id===user.id),other=room.players.find(p=>p.id!==user.id);
  const size=room.mode==='twoByTwo'?2:3;
  const visible=room.start_ms!==null&&now>=room.start_ms+3000;
  const scramble=visible?raceScramble(room.seed,0,room.mode):[];
  const otherRun=other?.runs[0];
  const opponent=other&&visible?{
    id:other.id,name:other.name,k:0,
    state:otherRun?Array.from(new Cube(size).applyMoves([...scramble,...otherRun.preEvents.map(e=>e.m),...otherRun.events.map(e=>e.m)]).state):
      other.live?.state??Array.from(new Cube(size).applyMoves(scramble).state),
    moveCount:otherRun?.events.length??other.live?.moveCount??0,
  }:null;
  return {
    id,round:room.round_id,mode:room.mode,nextMode:room.next_mode,size,durationMs:room.duration_ms,serverNow:now,startMs:room.start_ms,
    final:room.round_final,matchFinal:room.match_final,matchWinner:room.match_winner,roundLimit:room.round_limit,
    rounds:room.rounds,owner:room.owner_id,stake:room.stake,currency:room.currency,locked:room.locked,
    opponent,ownOutcome:me.outcome??null,ack:me.runs.length-1,runs:me.runs,
    scrambles:visible?[{k:0,moves:scramble}]:[],left:action==='leave',
    players:room.players.map(p=>({id:p.id,name:p.name,ready:p.ready,rematch:p.rematch,departed:p.departed,skinId:skins[p.id],
      score:{score:room.rounds.filter(r=>r.winner===p.id).length,lastEndT:p.runs[0]?.endT??0,totalMoves:p.runs[0]?.events.length??0}})),
  };
}
