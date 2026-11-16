import assert from 'node:assert/strict';
import {test} from 'node:test';
import {invert,scrambleAt} from '../packages/engine/dist/index.js';
import {practiceEligibility,preparePracticeAction} from './practice.mjs';
import {validSolve} from './test-support.mjs';

test('server issues its own seed and verifies replay before calculating trusted eligibility',()=>{
  const issued=preparePracticeAction({action:'issue',size:3,seed:'caller-supplied'});
  const {p_id:challengeId,p_seed:seed}=issued.input;
  assert.match(seed,/^[0-9a-f]{64}$/);
  assert.notEqual(seed,preparePracticeAction({action:'issue',size:3}).input.p_seed);
  const moves=invert(scrambleAt(seed,3,0),3);
  const solve={...validSolve(),seed,events:moves.map((m,index)=>({m,t:index*200})),
    timeMs:(moves.length-1)*200,inspectionMs:16000,penalty:'+2'};
  const finish=preparePracticeAction({action:'finish',challengeId,solve,eligible:false});
  assert.equal(finish.input.p_eligible,true);
  assert.equal(finish.input.p_effective_ms,solve.timeMs+2000);
  const invalid={...solve,events:solve.events.slice(1).map((event,index)=>({...event,t:index*200})),timeMs:(moves.length-2)*200};
  assert.throws(()=>preparePracticeAction({action:'finish',challengeId,solve:invalid}));
});

test('eligibility excludes rotations and uses unpenalized duration for minimum time',()=>{
  const make=(size,timeMs,turns,penalty='none')=>({
    size,timeMs,penalty,events:Array.from({length:turns},()=>({m:'R'})).concat({m:'x'})
  });
  for (const [size,turns,ms] of [[2,6,1500],[3,14,3500],[4,35,15000],[5,55,35000]]) {
    assert.equal(practiceEligibility(make(size,ms,turns)).eligible,true);
    assert.equal(practiceEligibility(make(size,ms,turns-1)).eligible,false);
    assert.deepEqual(practiceEligibility(make(size,ms-1,turns,'+2')),
      {moves:turns,effectiveMs:ms+1999,eligible:false});
    assert.equal(practiceEligibility(make(size,ms,turns,'DNF')).eligible,false);
  }
  assert.equal(practiceEligibility(make(6,35000,55)).eligible,false);
});
