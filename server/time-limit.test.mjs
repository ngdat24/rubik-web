import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {Cube,invert} from '../packages/engine/dist/index.js';
import {raceScramble,raceComplete} from '../shared/race-rules.mjs';
import {createCloudHandler} from './cloud.mjs';
import {fakeDatabase} from './test-support.mjs';

test('Time Limit isolates sessions, verifies all modes, acknowledges once and ranks completed attempts',async()=>{
  const epoch=Date.now(),db=fakeDatabase({raceClock:()=>epoch}),user='11111111-1111-4111-8111-111111111111';db.profiles.set(user,{id:user,name:'An'});
  const server=createServer(createCloudHandler({env:{SUPABASE_URL:'https://test',SUPABASE_ANON_KEY:'public',SUPABASE_SECRET_KEY:'sb_secret_test'},fetcher:db.fetcher}));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
  const call=async(path,body,token='anonymous-a')=>{const r=await fetch(base+'/api/'+path,{method:body?'POST':'GET',headers:{...(token?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,body:await r.json()};};
  try{
    assert.equal((await call('time-limit',{id:'a'.repeat(32),action:'create',mode:'fullSolve'},null)).status,401);
    assert.equal((await call('time-limit-leaderboard?mode=wrong',undefined,null)).status,400);
    const ids=[];
    for(const [i,mode] of ['oneFace','f2lRush','fullSolve'].entries()){
      const id=String(i+1).repeat(32);ids.push(id);
      const created=await call('time-limit',{action:'create',id,mode,durationMs:1,score:999});
      assert.equal(created.status,200);assert.equal(created.body.durationMs,180000);assert.equal(created.body.players.length,1);assert.equal(created.body.scrambles.length,0);assert.equal('seed' in created.body,false);
      assert.equal((await call('time-limit?id='+id,undefined,'anonymous-b')).status,409);
      assert.equal((await call('time-limit',{action:'forfeit',id},'anonymous-b')).status,409);
      assert.equal((await call('race',{action:'join',id})).status,409);
      const original=db.timeLimits.get(id);const firstSeed=original.seed;
      await call('time-limit',{action:'create',id,mode});assert.equal(db.timeLimits.get(id).seed,firstSeed);
      db.advanceRace(3500);const inspection=await call('time-limit?id='+id);assert.equal(inspection.body.phase,'inspecting');assert.equal(inspection.body.scrambles.length,3);
      db.advanceRace(15000);
      const cube=new Cube(3).applyMoves(raceScramble(original.seed,0,mode)),events=[];
      for(const m of invert(raceScramble(original.seed,0,mode),3)){events.push({m,t:events.length+1});cube.applyMove(m);if(raceComplete(cube.state,mode))break;}
      const run={k:0,preEvents:[],events,endT:events.at(-1).t};
      const bad=await call('time-limit',{action:'cube_done',id,run:{...run,endT:999}});assert.equal(bad.status,400);
      const ack=await call('time-limit',{action:'cube_done',id,run,moveCost:999,score:999});assert.equal(ack.status,200);assert.equal(ack.body.ack,0);assert.equal(ack.body.players[0].score.score,1);
      await call('time-limit',{action:'cube_done',id,run});assert.equal(original.score,1);assert.ok(original.totalMoves<999);
      const during=(await call('time-limit-leaderboard?mode='+mode,undefined,null)).body.rows;assert.equal(during.some(row=>row.id===id),false);
    }
    const canceled='e'.repeat(32);await call('time-limit',{action:'create',id:canceled,mode:'oneFace'});await call('time-limit',{action:'forfeit',id:canceled});
    db.advanceRace(201001);
    for(const [i,mode] of ['oneFace','f2lRush','fullSolve'].entries()){
      const board=await call('time-limit-leaderboard?mode='+mode,undefined,null);assert.equal(board.status,200);assert.equal(board.body.rows.length,1);assert.equal(board.body.rows[0].id,ids[i]);assert.equal(board.body.rows[0].score,1);
      const ended=await call('time-limit?id='+ids[i]);assert.equal(ended.body.final,true);assert.equal(ended.body.scrambles.length,0);
      const duplicate=await call('time-limit',{action:'cube_done',id:ids[i],run:db.timeLimits.get(ids[i]).runs[0]});assert.equal(duplicate.status,200);assert.equal(db.timeLimits.get(ids[i]).score,1);
      assert.equal((await call('time-limit',{action:'cube_done',id:ids[i],run:{...db.timeLimits.get(ids[i]).runs[0],k:1}})).status,400);
    }
    // Many attempts by one user remain distinct; score first, then last end and moves.
    const old=db.timeLimits.get(ids[0]);for(let i=0;i<12;i++)db.timeLimits.set('rank-'+i,{...old,id:'rank-'+i,score:2,lastEndT:100+i,totalMoves:50-i});
    db.timeLimits.set('tie-worse',{...old,id:'tie-worse',score:3,lastEndT:179000,totalMoves:100});
    db.timeLimits.set('tie-best',{...old,id:'tie-best',score:3,lastEndT:179000,totalMoves:10});
    const top=(await call('time-limit-leaderboard?mode=oneFace',undefined,null)).body.rows;assert.equal(top.length,10);assert.ok(top.every(row=>row.name==='An'));
    assert.deepEqual(top.slice(0,2).map(r=>r.id),['tie-best','tie-worse']);assert.deepEqual(top.slice(2).map(r=>r.lastEndT),Array.from({length:8},(_,i)=>100+i));
    assert.equal(db.solves.size,0);assert.equal(db.rooms.size,0);
    assert.equal((await fetch(base+'/api/account',{method:'DELETE',headers:{Authorization:'Bearer anonymous-a'}})).status,200);assert.equal(db.timeLimits.size,0);
  }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
