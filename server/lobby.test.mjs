import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {invert,Cube} from '../packages/engine/dist/index.js';
import {raceScramble,raceComplete} from '../shared/race-rules.mjs';
import {fakeDatabase} from './test-support.mjs';
import {createCloudHandler} from './cloud.mjs';

test('reusable rooms: short codes, three modes, round isolation, rematch, presence, leave/rejoin and expiry',async()=>{
  const epoch=Date.now(),db=fakeDatabase({raceClock:()=>epoch});
  const users=['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222'],clients=['a'.repeat(32),'b'.repeat(32)];
  users.forEach((id,i)=>db.profiles.set(id,{id,name:['An','Bình'][i]}));
  const server=createServer(createCloudHandler({env:{SUPABASE_URL:'https://test',SUPABASE_ANON_KEY:'public',SUPABASE_SECRET_KEY:'sb_secret_test'},fetcher:db.fetcher}));
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
  let id='AB23CD45',round;
  const call=async(action,i=0,extra={})=>{
    const r=await fetch(base+'/api/race'+(action==='get'?`?id=${id}&client=${clients[i]}`:''),{
      method:action==='get'?'GET':'POST',headers:{Authorization:'Bearer '+['anonymous-a','anonymous-b'][i],'Content-Type':'application/json'},
      ...(action==='get'?{}:{body:JSON.stringify({id,action,client:clients[i],round,mode:'fullSolve',...extra})})});
    return {status:r.status,body:await r.json()};
  };
  const heartbeatAdvance=async ms=>{while(ms>0){const step=Math.min(ms,60000);db.advanceRace(step);ms-=step;assert.equal((await call('get')).status,200);assert.equal((await call('get',1)).status,200);}};
  try{
    let a=await call('create');assert.equal(a.status,200);round=a.body.round;
    assert.equal(a.body.id.length,8);assert.equal(a.body.scrambles.length,0);assert.equal('seed' in a.body,false);
    assert.equal((await call('create',1)).status,409);assert.equal((await call('get',1)).status,409);
    a=await call('join',1);assert.equal(a.status,200);round=a.body.round;
    for(const mode of ['fullSolve','oneFace','f2lRush']){
      const lobby=db.lobbies.get(id);
      if(lobby.start_ms!==null){
        assert.equal((await call('mode',0,{mode})).status,200);
        const previous=round;assert.equal((await call('rematch',0,{mode})).status,200);assert.equal(db.lobbies.get(id).round_id,previous);
        const b=await call('rematch',1,{mode});assert.equal(b.status,200);round=b.body.round;assert.notEqual(round,previous);
        assert.equal((await call('rematch',0,{mode,round:previous})).status,409);
      }else{
        const selected=await call('mode',0,{mode});assert.equal(selected.status,200);round=selected.body.round;
        assert.equal((await call('ready',0,{mode})).status,200);assert.equal((await call('ready',1,{mode})).status,200);
      }
      assert.equal(db.lobbies.get(id).mode,mode);assert.equal(db.lobbies.size,1);
      assert.equal((await call('mode',1,{mode:'fullSolve'})).status,409);
      await heartbeatAdvance(18000);
      const cube=new Cube(3).applyMoves(raceScramble(db.lobbies.get(id).seed,0,mode)),moves=[];
      for(const m of invert(raceScramble(db.lobbies.get(id).seed,0,mode),3)){cube.applyMove(m);moves.push(m);if(raceComplete(cube.state,mode))break;}
      const run={k:0,preEvents:[],endT:moves.length,events:moves.map((m,i)=>({m,t:i+1}))};db.advanceRace(1000);
      assert.equal((await call('cube_done',0,{run})).status,200);assert.equal((await call('cube_done',0,{run})).status,200);
      assert.equal(db.lobbies.get(id).players[0].runs.length,1);
      await heartbeatAdvance(183000);assert.equal((await call('get')).body.final,true);
    }
    // A mode change cancels a previously accepted rematch consent.
    assert.equal((await call('rematch',0,{mode:'f2lRush'})).status,200);
    assert.equal((await call('mode',1,{mode:'oneFace'})).status,200);assert.equal(db.lobbies.get(id).players[0].rematch,false);
    // Reload claims a new connection; an old tab's delayed leave is harmless.
    const oldClient=clients[0];clients[0]='c'.repeat(32);assert.equal((await call('join')).status,200);
    assert.equal((await call('leave',0,{client:oldClient})).status,200);assert.equal(db.lobbies.get(id).players[0].present,true);
    assert.equal((await call('leave',1)).status,200);assert.equal(db.lobbies.has(id),true);
    assert.equal((await call('join',1)).status,200);round=db.lobbies.get(id).round_id;
    // Active room survives >1h because membership is heartbeated.
    await heartbeatAdvance(3601000);assert.equal(db.lobbies.has(id),true);
    assert.equal((await call('leave',0,{depart:true})).status,200);db.advanceRace(5001);
    assert.equal((await call('get',1)).status,200);assert.equal(db.lobbies.get(id).players[0].present,false);
    assert.equal((await call('leave',1)).body.gone,true);assert.equal(db.lobbies.has(id),false);
    assert.equal((await call('join')).status,404);
    id='NEWROOM2';const newRoom=await call('create');assert.equal(newRoom.status,200);round=newRoom.body.round;
    assert.equal((await call('join',1)).status,200);round=db.lobbies.get(id).round_id;
    db.advanceRace(90001);assert.equal((await call('get')).body.gone,true);assert.equal(db.lobbies.has(id),false);
    assert.equal(db.solves.size,0);assert.equal(db.timeLimits.size,0);
  }finally{await new Promise(r=>server.close(r));}
});
