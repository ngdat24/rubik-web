import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createLanServer} from './server.mjs';
import {scrambleAt,invert,ENGINE_VERSION} from '../../packages/engine/dist/index.js';

test('LAN profiles, replay, ranking, deduplication and restart persistence',async()=>{
  const dataDir=mkdtempSync(join(tmpdir(),'rubik-lan-'));let server;
  const start=async()=>{server=createLanServer({dataDir});await new Promise(r=>server.listen(0,'127.0.0.1',r));return 'http://127.0.0.1:'+server.address().port;};
  const stop=()=>new Promise(r=>{server.closeAllConnections();server.close(r);});
  try{
    let base=await start();
    const call=async(path,body,token)=>{const response=await fetch(base+'/api/'+path,{method:body?'POST':'GET',headers:{...(body?{'Content-Type':'application/json'}:{}),...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:response.status,data:await response.json()};};
    const a=(await call('player',{name:'An'})).data,b=(await call('player',{name:'Bình'})).data;
    assert.equal((await call('player',{name:'an'})).status,400);
    assert.equal((await call('player',{name:'Cường'},'bad')).status,401);
    const solve=(id,size,timeMs,inspectionMs=0)=>{const moves=invert(scrambleAt('lan-test',size,0));return {schemaVersion:1,id,size,seed:'lan-test',scrambleIndex:0,scrambleSource:'generated',genVersion:1,engineVersion:ENGINE_VERSION,preEvents:[],events:moves.map((m,i)=>({m,t:Math.floor(i*timeMs/(moves.length-1))})),inspectionMs,timeMs,penalty:inspectionMs>15000?'+2':'none',startedAt:new Date().toISOString()};};
    const first=solve('first',3,5000);
    assert.equal((await call('solves',{solve:first})).status,401);
    assert.equal((await call('solves',{solve:first},a.token)).status,200);
    assert.equal((await call('solves',{solve:first},a.token)).status,200);
    assert.equal((await call('solves',{solve:first},b.token)).status,400);
    assert.equal((await call('solves',{solve:solve('slow',3,9000)},a.token)).status,200);
    assert.equal((await call('solves',{solve:solve('fast',3,2000,16000)},b.token)).status,200);
    assert.equal((await call('solves',{solve:solve('two',2,3000)},a.token)).status,200);
    const dnf={...solve('dnf',2,0),events:[],inspectionMs:17001,penalty:'DNF'};
    assert.equal((await call('solves',{solve:dnf},b.token)).status,200);
    const invalid=solve('bad',3,1000);invalid.events[invalid.events.length-1].m='U';
    assert.equal((await call('solves',{solve:invalid},b.token)).status,400);
    const wrongPenalty=solve('penalty',3,1000,16000);wrongPenalty.penalty='none';assert.equal((await call('solves',{solve:wrongPenalty},a.token)).status,400);
    assert.equal((await call('solves',{solve:{...solve('four',2,1000),size:4}},a.token)).status,400);
    assert.deepEqual((await call('leaderboard?size=3')).data.rows.map(r=>[r.name,r.timeMs]),[['Bình',4000],['An',5000],['An',9000]]);
    assert.equal((await call('leaderboard?size=2')).data.rows.length,1);
    await call('player',{name:'An mới'},a.token);
    await stop();base=await start();
    assert.equal((await call('player',undefined,a.token)).data.name,'An mới');
    assert.equal((await call('leaderboard?size=3')).data.rows[1].name,'An mới');
    const cross=await fetch(base+'/api/player',{method:'POST',headers:{Origin:'http://evil.example','Content-Type':'application/json'},body:JSON.stringify({name:'Evil'})});assert.equal(cross.status,403);
    assert.equal((await fetch(base+'/..%2f..%2fpackage.json')).status,403);
  }finally{if(server?.listening)await stop();rmSync(dataDir,{recursive:true,force:true});}
});
