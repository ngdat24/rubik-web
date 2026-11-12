import {Cube,ENGINE_VERSION,scrambleAt} from '../packages/engine/dist/index.js';
import {validateHistoryBackup} from '../packages/timer/dist/index.js';

/** Replays the original record; personal penalty overrides never affect ranking. */
export function verifySolve(value){
  const solve=validateHistoryBackup({version:1,entries:[{solve:value,penaltyOverride:null}]}).entries[0].solve;
  if(solve.engineVersion!==ENGINE_VERSION)throw new Error('Phiên bản engine không được hỗ trợ.');
  const expected=solve.inspectionMs>17000?'DNF':solve.inspectionMs>15000?'+2':'none';
  if(solve.penalty!==expected)throw new Error('Phạt inspection không khớp.');
  if(solve.penalty!=='DNF'){
    const cube=new Cube(solve.size).applyMoves(scrambleAt(solve.seed,solve.size,solve.scrambleIndex));
    cube.applyMoves(solve.preEvents.map(e=>e.m));
    if(cube.isSolved())throw new Error('Scramble đã được giải trước khi bắt đầu.');
    for(let i=0;i<solve.events.length;i++){
      cube.applyMove(solve.events[i].m);
      if(cube.isSolved()&&i!==solve.events.length-1)throw new Error('Chuỗi tiếp tục sau khi đã giải xong.');
    }
    if(!cube.isSolved())throw new Error('Chuỗi nước chưa giải xong scramble.');
  }
  return solve;
}
