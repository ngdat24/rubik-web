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
  const solve={...validSolve(),seed,events:moves.map((m,index)=>({m,t:index*130})),
    timeMs:(moves.length-1)*130,inspectionMs:16000,penalty:'+2'};
  const finish=preparePracticeAction({action:'finish',challengeId,solve,eligible:false});
  assert.equal(finish.input.p_eligible,true);
  assert.equal(finish.input.p_effective_ms,solve.timeMs+2000);
  const invalid={...solve,events:solve.events.slice(1).map((event,index)=>({...event,t:index*130})),timeMs:(moves.length-2)*130};
  assert.throws(()=>preparePracticeAction({action:'finish',challengeId,solve:invalid}));
});

test('eligibility excludes rotations and uses unpenalized duration for minimum time',()=>{
  const make=(size,timeMs,turns,penalty='none')=>({
    size,timeMs,penalty,events:Array.from({length:turns},()=>({m:'R'})).concat({m:'x'})
  });
  assert.equal(practiceEligibility(make(2,500,4)).eligible,true);
  assert.equal(practiceEligibility(make(3,1500,11)).eligible,false);
  assert.deepEqual(practiceEligibility(make(3,1499,12,'+2')),{moves:12,effectiveMs:3499,eligible:false});
  assert.equal(practiceEligibility(make(4,3000,20)).eligible,true);
  assert.equal(practiceEligibility(make(5,5000,30)).eligible,true);
  assert.equal(practiceEligibility(make(6,5000,29)).eligible,false);
  assert.equal(practiceEligibility(make(6,5000,30)).eligible,false);
});
