import {randomBytes} from 'node:crypto';
import {publicRace,verifyRaceCube,raceScore} from './race.mjs';

export const TIME_LIMIT_MODES=['oneFace','f2lRush','fullSolve'];
export async function handleTimeLimit({request,user,method,body,url}){
  const action=method==='GET'?'get':body.action;
  const id=method==='GET'?url.searchParams.get('id'):body.id;
  if(!['get','create','cube_done','forfeit'].includes(action)||typeof id!=='string'||!/^[a-f0-9]{32}$/.test(id))throw new Error('Lượt Time Limit không hợp lệ.');
  if(action==='create'&&!TIME_LIMIT_MODES.includes(body.mode))throw new Error('Danh mục Time Limit không hợp lệ.');
  const rpc=(action,payload={})=>request('/rest/v1/rpc/time_limit_action',{method:'POST',body:{p_user:user.id,p_id:id,p_action:action,p_payload:payload}});
  let snapshot;
  if(action==='cube_done'){
    const before=await rpc('get'),room=before.room,player=room.players[0];
    const run=verifyRaceCube(room,player,body.run,before.now_ms);
    snapshot=await rpc(action,{run,moveCost:raceScore([run],room.mode,room.duration_ms).totalMoves});
  }else snapshot=await rpc(action,action==='create'?{mode:body.mode,seed:randomBytes(32).toString('hex')}:{});
  return {...publicRace(snapshot.room,user.id,snapshot.now_ms),abandoned:!!snapshot.room.forfeit};
}
