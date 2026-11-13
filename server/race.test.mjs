import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Cube,matchScrambleAt,invert,f2lSolvedAny} from '../packages/engine/dist/index.js';
import {verifyRaceCube,publicRace,handleRace} from './race.mjs';

const fixture=()=>({id:'a'.repeat(32),seed:'server-private',mode:'fullSolve',duration_ms:120000,start_ms:100000,forfeit:null,
  players:[{id:'a',name:'An',ready:true,runs:[]},{id:'b',name:'Bình',ready:true,runs:[]}]});
function solved(room,k=0,start=0){
  const moves=invert(matchScrambleAt(room.seed,3,k,1),3);
  const events=moves.map((m,i)=>({m,t:start+i+1}));return {k,endT:events.at(-1).t,preEvents:[],events};
}
test('server replays exact challenge; cutoff inclusive and grace exclusive',()=>{
  const room=fixture(),p=room.players[0],run=solved(room);run.events=run.events.map(e=>({...e,t:room.duration_ms}));run.endT=room.duration_ms;
  assert.equal(verifyRaceCube(room,p,run,room.start_ms+18000+room.duration_ms).endT,120000);
  assert.doesNotThrow(()=>verifyRaceCube(room,p,run,room.start_ms+21000+room.duration_ms-1));
  assert.throws(()=>verifyRaceCube(room,p,run,room.start_ms+21000+room.duration_ms));
  assert.throws(()=>verifyRaceCube(room,p,{...run,endT:120001,events:run.events.map(e=>({...e,t:120001}))},300000));
});
test('rejects unsolved, extra moves, future/backwards stamps, invalid preEvents and skipped cubes',()=>{
  const room=fixture(),p=room.players[0],run=solved(room),now=120000;
  assert.throws(()=>verifyRaceCube(room,p,{...run,events:run.events.slice(0,-1)},now));
  assert.throws(()=>verifyRaceCube(room,p,{...run,events:[...run.events,{m:'R',t:50}],endT:50},now));
  assert.throws(()=>verifyRaceCube(room,p,{...run,events:[{m:'R',t:5},{m:'U',t:4}]},now));
  assert.throws(()=>verifyRaceCube(room,p,{...run,preEvents:[{m:'R',t:100}]},now));
  assert.throws(()=>verifyRaceCube(room,p,{...run,k:2},now));
  assert.throws(()=>verifyRaceCube(room,p,{...run,events:run.events.map(e=>({...e,t:10000})),endT:10000},now));
});
test('acknowledged duplicates remain retryable after grace, conflicting receipts rejected',()=>{
  const room=fixture(),p=room.players[0],run=solved(room),verified=verifyRaceCube(room,p,run,120000);
  p.runs.push(verified);
  // PostgreSQL JSONB property ordering differs from insertion ordering.
  p.runs[0]={result:verified.result,events:verified.events,preEvents:[],endT:verified.endT,startT:0,k:0};
  assert.deepEqual(verifyRaceCube(room,p,run,999999),verified);
  assert.throws(()=>verifyRaceCube(room,p,{...run,endT:1000},999999));
  const next=solved(room,1,verified.endT);assert.equal(verifyRaceCube(room,p,next,120000).startT,verified.endT);
});
test('F2L stops at first predicate completion',()=>{
  const room=fixture();room.mode='f2lRush';room.duration_ms=45000;
  const run=solved(room),cube=new Cube(3).applyMoves(matchScrambleAt(room.seed,3,0,1));
  const events=[];for(const event of run.events){cube.applyMove(event.m);events.push(event);if(f2lSolvedAny(cube.state))break;}
  assert.equal(verifyRaceCube(room,room.players[0],{...run,events,endT:events.at(-1).t},120000).result,'f2l');
});
test('lobby/countdown hides all scramble and seed; inspection exposes three only, own events only',()=>{
  const room=fixture();room.players[1].runs=[{events:[{m:'R',t:5}],preEvents:[],endT:5,result:'solved'}];
  for(const now of [100000,102999])assert.equal(publicRace(room,'a',now).scrambles.length,0);
  const view=publicRace(room,'a',103000);
  assert.equal(view.phase,'inspecting');assert.equal(view.scrambles.length,3);
  assert.equal(JSON.stringify(view).includes('server-private'),false);
  assert.equal(JSON.stringify(view.players).includes('events'),false);
  assert.throws(()=>publicRace(room,'stranger',103000));
});
test('server final score and forfeit; no premature result during grace',()=>{
  const room=fixture();room.players[0].runs=[{events:[{m:'R',t:5}],endT:5,result:'solved'}];
  assert.equal(publicRace(room,'a',238000).result,null);
  assert.equal(publicRace(room,'a',241000).result,'A');
  room.forfeit='a';assert.equal(publicRace(room,'a',120000).result,'B');
});
test('route validates invite and action before RPC; does not trust player identity from body',async()=>{
  const room=fixture(),calls=[];
  const request=async(path,{body})=>{calls.push(body);return {room,now_ms:100000};};
  await handleRace({request,user:{id:'a'},method:'POST',body:{action:'ready',id:room.id,user:'b'},url:new URL('https://test/api/race')});
  assert.equal(calls[0].p_user,'a');
  await assert.rejects(handleRace({request,user:{id:'a'},method:'POST',body:{action:'start',id:room.id},url:new URL('https://test')}));
  assert.equal(calls.length,1);
});
