import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createCloudHandler} from './cloud.mjs';
import {fakeDatabase,validSolve} from './test-support.mjs';

test('cloud API verifies identities, scopes history, rejects conflicts and does not rank overrides/imports',async()=>{
  const db=fakeDatabase(),env={SUPABASE_URL:'https://db.test',SUPABASE_ANON_KEY:'public-test',SUPABASE_SERVICE_ROLE_KEY:'private-test'};
  const server=createServer(createCloudHandler({env,fetcher:db.fetcher}));await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const base='http://127.0.0.1:'+server.address().port;
  const call=async(path,body,token='token-a',method)=>{
    const response=await fetch(base+'/api/'+path,{method:method??(body?'POST':'GET'),headers:{...(token?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:response.status,data:await response.json()};
  };
  try{
    assert.equal((await call('solves',undefined,'bad')).status,401);
    await call('player',{name:'An',id:'someone-else'});await call('player',{name:'Bình'},'token-b');
    assert.equal(db.profiles.size,2);assert.equal((await call('player',{name:'An'},'token-b')).status,409);
    const body={solve:validSolve(),penaltyOverride:null,deleted:false,ranked:true,revision:null,user_id:'someone-else'};
    const saved=await call('solves',body);assert.equal(saved.status,200);assert.equal(saved.data.row.revision,1);
    assert.equal((await call('solves',body)).status,200);
    assert.equal((await call('solves',body,'token-b')).status,409);
    assert.equal((await call('solves',undefined,'token-b')).data.rows.length,0);
    assert.equal((await call('solves')).data.rows.length,1);
    assert.equal((await call('solves',{...body,penaltyOverride:'+2',revision:1})).status,200);
    const firstDelta=(await call('solves?since=0')).data;
    assert.equal(firstDelta.rows.length,1);assert.equal(firstDelta.rows[0].penalty_override,'+2');
    const cursor=firstDelta.cursor;
    assert.equal((await call('solves?since='+cursor)).data.rows.length,0);
    assert.equal((await call('solves?since=0',undefined,'token-b')).data.rows.length,0);
    assert.equal((await call('solves?since=-1')).status,400);
    assert.equal((await call('solves',{...body,penaltyOverride:'DNF',revision:1})).status,409);
    const lb=await call('leaderboard?size=3',undefined,null);assert.equal(lb.data.rows[0].timeMs,body.solve.timeMs);
    const broken=validSolve('broken');broken.events[broken.events.length-1].m='U';assert.equal((await call('solves',{...body,solve:broken})).status,400);
    assert.equal((await call('solves',{...body,solve:validSolve('import'),ranked:false})).status,200);
    assert.equal((await call('solves',{...body,solve:validSolve('four',4)})).status,200);assert.equal(db.solves.get('four').ranked,false);
    const later=(await call('solves?since='+cursor)).data;
    assert.deepEqual(later.rows.map(row=>row.id),['import','four']);
    assert.equal((await call('solves',{...body,deleted:true,penaltyOverride:'+2',revision:2})).status,200);
    const deleted=(await call('solves?since='+later.cursor)).data;
    assert.equal(deleted.rows.length,1);assert.equal(deleted.rows[0].deleted,true);
    db.setQuota(true);assert.equal((await call('solves')).status,429);db.setQuota(false);
    assert.equal((await call('solves?offset=-1')).status,400);
    assert.equal((await call('account',undefined,'token-b','DELETE')).status,200);
    const deletion=db.calls.find(c=>c.method==='DELETE');assert.ok(deletion.url.pathname.endsWith('22222222-2222-4222-8222-222222222222'));
    const cross=await fetch(base+'/api/player',{method:'POST',headers:{Origin:'https://evil.test','Content-Type':'application/json'},body:'{}'});assert.equal(cross.status,403);
    assert.equal(JSON.stringify((await call('player')).data).includes('private-test'),false);
    env.SUPABASE_SECRET_KEY='sb_secret_test';
    assert.equal((await call('player')).status,200);
    const modern=db.calls.at(-1);assert.equal(modern.headers.apikey,'sb_secret_test');
    assert.equal(modern.headers.Authorization,undefined);
    const fixture=validSolve('page');
    for(let i=0;i<501;i++)db.solves.set('page-'+i,{id:'page-'+i,user_id:'22222222-2222-4222-8222-222222222222',solve:{...fixture,id:'page-'+i},penalty_override:null,deleted:false,revision:1,sync_version:100+i});
    const page1=(await call('solves?since=0',undefined,'token-b')).data;
    assert.equal(page1.rows.length,500);assert.equal(page1.hasMore,true);
    const page2=(await call('solves?since='+page1.cursor,undefined,'token-b')).data;
    assert.equal(page2.rows.length,1);assert.equal(page2.hasMore,false);
    assert.equal(new Set([...page1.rows,...page2.rows].map(row=>row.id)).size,501);
  }finally{await new Promise(r=>{server.closeAllConnections();server.close(r);});}
});
