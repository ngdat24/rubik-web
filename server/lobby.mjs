import {randomBytes} from 'node:crypto';
import {publicRace,verifyRaceCube,verifyRaceProgress} from './race.mjs';

export async function handleLobby({request,user,method,body,url}){
  const action=method==='GET'?'get':body.action;
  const id=(method==='GET'?url.searchParams.get('id'):body.id)?.toUpperCase();
  const client=method==='GET'?url.searchParams.get('client'):body.client;
  const round=body.round;
  if(!/^[A-Z0-9]{8}$/.test(id??'')||!/^[a-f0-9]{32}$/.test(client??'')||
    !['create','join','get','ready','mode','rematch','leave','cube_done','progress'].includes(action))throw new Error('Mã phòng gồm 8 chữ/số; phiên kết nối không hợp lệ.');
  if(['create','mode'].includes(action)&&!['fullSolve','f2lRush','oneFace'].includes(body.mode))throw new Error('Chế độ không hợp lệ.');
  if(!['create','join','get','leave'].includes(action)&&!/^[a-f0-9]{32}$/.test(round??''))throw new Error('Ván đấu không hợp lệ.');
  const rpc=(action,payload={})=>request('/rest/v1/rpc/lobby_action',{method:'POST',body:{p_user:user.id,p_code:id,p_action:action,p_payload:{client,round,...payload}}});
  let snapshot;
  if(action==='cube_done'||action==='progress'){
    const before=await rpc('get');
    if(before.gone)return {gone:true,id};
    const room=before.room,player=room.players.find(p=>p.id===user.id);
    if(room.round_id!==round)throw new Error('Ván đã đổi. Đang tải lại phòng.');
    if(action==='cube_done')snapshot=await rpc(action,{run:verifyRaceCube(room,player,body.run,before.now_ms)});
    else{
      const live=verifyRaceProgress(room,player,body.progress,before.now_ms);
      snapshot=live?await rpc(action,{live}):before;
    }
  }else snapshot=await rpc(action,{
    ...(['create','mode','ready','rematch'].includes(action)?{mode:body.mode}:{}),
    ...(['create','rematch','mode','join'].includes(action)?{seed:randomBytes(32).toString('hex')}:{}),
    ...(action==='leave'?{depart:body.depart===true}:{})});
  if(snapshot.gone)return {gone:true,id};
  const room=snapshot.room;
  const view=publicRace(room,user.id,snapshot.now_ms);
  return {...view,round:room.round_id,nextMode:room.next_mode,
    players:view.players.map((p,i)=>({...p,present:room.players[i].present,rematch:room.players[i].rematch})),
    left:action==='leave'};
}
