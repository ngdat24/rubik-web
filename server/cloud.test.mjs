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
    assert.equal((await call('solves',undefined,'unconfirmed-a')).status,401);
    assert.equal((await call('solves',undefined,'anonymous-a')).status,200);
    await call('player',{name:'An',id:'someone-else'});await call('player',{name:'Bình'},'token-b');
    assert.equal(db.profiles.size,2);assert.equal((await call('player',{name:'An'},'token-b')).status,409);
    const collision=await call('player',{name:'an'},'anonymous-b');assert.equal(collision.status,409);assert.match(collision.data.error,/chọn tên khác/);
    assert.equal((await call('player',{name:'Bình mới'},'anonymous-b')).status,200);
    assert.equal((await call('player',undefined,'anonymous-a')).data.name,'An');
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
    const shared='a'.repeat(32),other='c'.repeat(32);
    assert.equal((await call('race',{action:'create',id:shared,mode:'fullSolve'})).status,200);
    assert.equal((await call('race',{action:'join',id:shared},'token-b')).status,200);
    assert.equal((await call('race',{action:'create',id:other,mode:'fullSolve'})).status,200);
    assert.equal((await call('account',undefined,'token-b','DELETE')).status,200);
    assert.equal(db.rooms.has(shared),false);assert.equal(db.rooms.has(other),true);
    const deletion=db.calls.find(c=>c.method==='DELETE'&&c.url.pathname.startsWith('/auth/'));assert.ok(deletion.url.pathname.endsWith('22222222-2222-4222-8222-222222222222'));
    const cross=await fetch(base+'/api/player',{method:'POST',headers:{Origin:'https://evil.test','Content-Type':'application/json'},body:'{}'});assert.equal(cross.status,403);
    assert.equal(JSON.stringify((await call('player')).data).includes('private-test'),false);
    env.SUPABASE_SECRET_KEY='sb_secret_test';
    assert.equal((await call('player')).status,200);
    const modern=db.calls.at(-1);assert.equal(modern.headers.apikey,'sb_secret_test');
    assert.equal(modern.headers.Authorization,undefined);
    for(let i=0;i<12;i++)db.solves.set('rank-'+i,{id:'rank-'+i,user_id:'11111111-1111-4111-8111-111111111111',solve:{...validSolve('rank-'+i),timeMs:100+i},ranked:true,deleted:false});
    const top=(await call('leaderboard?size=3',undefined,null)).data.rows;
    assert.equal((await call('leaderboard?size=3&limit=999',undefined,null)).status,400);
    const extended=await call('leaderboard?size=3&limit=1000',undefined,null);
    assert.equal(extended.status,200);assert.ok(extended.data.rows.length>10);
    assert.ok(db.calls.some(c=>c.url.pathname.endsWith('/leaderboard_top1000')));
    assert.equal(top.length,10);assert.ok(top.every(row=>row.name==='An'));
    assert.deepEqual(top.map(row=>row.timeMs),Array.from({length:10},(_,i)=>100+i));
    const fixture=validSolve('page');
    for(let i=0;i<501;i++)db.solves.set('page-'+i,{id:'page-'+i,user_id:'22222222-2222-4222-8222-222222222222',solve:{...fixture,id:'page-'+i},penalty_override:null,deleted:false,revision:1,sync_version:100+i});
    const page1=(await call('solves?since=0',undefined,'token-b')).data;
    assert.equal(page1.rows.length,500);assert.equal(page1.hasMore,true);
    const page2=(await call('solves?since='+page1.cursor,undefined,'token-b')).data;
    assert.equal(page2.rows.length,1);assert.equal(page2.hasMore,false);
    assert.equal(new Set([...page1.rows,...page2.rows].map(row=>row.id)).size,501);
  }finally{await new Promise(r=>{server.closeAllConnections();server.close(r);});}
});

test('weekly board validates selectors and maintenance requires the exact cron secret',async()=>{
  let calls=[];
  const env={SUPABASE_URL:'https://db.test',SUPABASE_ANON_KEY:'public-test',SUPABASE_SECRET_KEY:'private-test',CRON_SECRET:'fixture-cron'};
  const server=createServer(createCloudHandler({env,fetcher:async(url,options)=>{
    calls.push({path:new URL(url).pathname,body:JSON.parse(options.body)});
    return Response.json(new URL(url).pathname.endsWith('/economy_maintain')
      ? {weeks:1,weeklyAwards:2} : {rows:[],closed:false});
  }}));
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const base='http://127.0.0.1:'+server.address().port;
  try{
    for(const token of [undefined,'wrong-secret','fixture-crom']){
      const response=await fetch(base+'/api/economy-maintenance',{headers:token?{Authorization:'Bearer '+token}:{}});
      assert.equal(response.status,401);
    }
    assert.equal((await fetch(base+'/api/economy-maintenance',{method:'POST'})).status,405);
    for(const query of ['size=1','size=11','size=3&week=invalid'])
      assert.equal((await fetch(base+'/api/weekly-leaderboard?'+query)).status,400);
    assert.equal(calls.length,0);
    const board=await fetch(base+'/api/weekly-leaderboard?size=3&week=previous');
    assert.equal(board.status,200);assert.match(board.headers.get('cache-control'),/s-maxage=15/);
    assert.deepEqual(calls[0],{path:'/rest/v1/rpc/economy_weekly_board',body:{p_size:3,p_previous:true}});
    const response=await fetch(base+'/api/economy-maintenance',{headers:{Authorization:'Bearer fixture-cron'}});
    assert.equal(response.status,200);assert.equal((await response.json()).weeklyAwards,2);
    assert.equal(calls[1].path,'/rest/v1/rpc/economy_maintain');
    delete env.CRON_SECRET;
    assert.equal((await fetch(base+'/api/economy-maintenance',{headers:{Authorization:'Bearer fixture-cron'}})).status,401);
    assert.equal(calls.length,2);
  }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});

test('single Vercel API entry preserves flat route URLs and query validation',async()=>{
  const names=['SUPABASE_URL','SUPABASE_ANON_KEY','SUPABASE_SECRET_KEY'];
  const previous=names.map(name=>process.env[name]);
  Object.assign(process.env,{SUPABASE_URL:'https://fixture.invalid',SUPABASE_ANON_KEY:'fixture-public',SUPABASE_SECRET_KEY:'fixture-private'});
  const {default:entry}=await import('../api/[route].mjs');
  const server=createServer(entry);await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const base='http://127.0.0.1:'+server.address().port;
  try{
    for(const name of ['account','player','practice','quests','race','skins','solves','time-limit','wallet'])
      assert.equal((await fetch(base+'/api/'+name)).status,401,name);
    for(const path of ['leaderboard?size=1','time-limit-leaderboard?mode=invalid','weekly-leaderboard?size=1'])
      assert.equal((await fetch(base+'/api/'+path)).status,400,path);
    assert.equal((await fetch(base+'/api/economy-maintenance')).status,401);
    assert.equal((await fetch(base+'/api/unknown')).status,404);
  }finally{
    server.closeAllConnections();await new Promise(r=>server.close(r));
    names.forEach((name,i)=>{if(previous[i]===undefined)delete process.env[name];else process.env[name]=previous[i];});
  }
});


test('shop API scopes transactions to the session, validates purchases and preserves retry IDs',async()=>{
  const user='11111111-1111-4111-8111-111111111111',reference='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const calls=[];let failure;
  const server=createServer(createCloudHandler({env:{SUPABASE_URL:'https://fixture.invalid',SUPABASE_ANON_KEY:'fixture-public',SUPABASE_SECRET_KEY:'fixture-private'},fetcher:async(input,options)=>{
    const path=new URL(input).pathname,body=options.body&&JSON.parse(options.body);
    if(path==='/auth/v1/user')return Response.json({id:user,is_anonymous:true});
    if(path.endsWith('/consume_quota'))return Response.json(true);
    calls.push({path,body});
    return failure?Response.json({code:'P0001',message:failure},{status:400}):Response.json({cb:100,zn:1});
  }}));
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
  const call=(data,token=true)=>fetch(base+'/api/shop',{method:data?'POST':'GET',headers:{...(token?{Authorization:'Bearer fixture'}:{}),...(data?{'Content-Type':'application/json'}:{})},...(data?{body:JSON.stringify(data)}:{})});
  try{
    assert.equal((await call(undefined,false)).status,401);
    assert.equal(calls.length,0);
    assert.equal((await call()).status,200);
    assert.deepEqual(calls.pop().body,{p_user:user,p_action:'get',p_data:{},p_reference:null});
    for(const action of [
      {action:'buy_skin',offerId:reference},{action:'reroll'},
      {action:'equip_skin',id:null},{action:'equip_utility',id:null,slot:'sound'},
      {action:'buy_utility',id:'fx_sound_purple_01',currency:'ZN'},
      {action:'open_crate',crate:'core',quantity:10},{action:'spin',season:'season_01',quantity:5}
    ]){
      const body={...action,requestId:reference,p_user:'other-user',price:0};
      assert.equal((await call(body)).status,200);
      const first=calls.at(-1);assert.equal(first.path,'/rest/v1/rpc/skin_shop_action');
      assert.equal(first.body.p_user,user);assert.equal(first.body.p_reference,reference);
      assert.equal(Object.hasOwn(first.body.p_data,'price'),false);
      assert.equal((await call(body)).status,200);assert.deepEqual(calls.at(-1),first);
    }
    const count=calls.length;
    for(const action of [
      {action:'spin',season:'season_01',quantity:-1},{action:'open_crate',crate:'core',quantity:100},
      {action:'buy_skin',offerId:'s1_red_crimson_core'},{action:'equip_utility',id:null,slot:'unknown'},
      {action:'buy_utility',id:'fx_sound_purple_01',currency:'USD'}
    ])assert.equal((await call({...action,requestId:reference})).status,400);
    assert.equal(calls.length,count);
    failure='insufficient_balance';
    const denied=await call({action:'spin',season:'season_01',quantity:1,requestId:reference});
    assert.equal(denied.status,409);assert.equal((await denied.json()).error,'Số dư không đủ.');
  }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});
