import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createCloudHandler} from './cloud.mjs';
import {parseChampionClaim} from './champion.mjs';

test('Champion claim validates size, variant, name and never exposes grant through the API',async()=>{
  assert.equal(parseChampionClaim({action:'grant',size:2,variant:'classic',name:'Test'}),undefined);
  for(const value of [{size:4},{variant:'other'},{name:'\u200b'},{name:'x'.repeat(33)}]){
    assert.equal(parseChampionClaim({action:'claim',size:2,variant:'classic',name:'Test',...value}),undefined);
  }
  const calls=[];
  const user='c1111111-1111-4111-8111-111111111111';
  const server=createServer(createCloudHandler({env:{SUPABASE_URL:'https://db.test',SUPABASE_ANON_KEY:'public',SUPABASE_SECRET_KEY:'secret'},
    fetcher:async(url,options)=>{
      const path=new URL(url).pathname;
      if(path==='/auth/v1/user')return Response.json({id:user,is_anonymous:true});
      if(path.endsWith('/consume_quota'))return Response.json(true);
      calls.push({path,body:JSON.parse(options.body)});
      return Response.json({awards:[]});
    }}));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const endpoint='http://127.0.0.1:'+server.address().port+'/api/champion';
  const send=body=>fetch(endpoint,{method:'POST',headers:{Authorization:'Bearer fixture','Content-Type':'application/json'},body:JSON.stringify(body)});
  try{
    assert.equal((await fetch(endpoint)).status,401);
    assert.equal((await send({action:'grant',size:2})).status,400);
    assert.equal((await send({action:'claim',size:2,variant:'classic',name:'Name',p_user:'attacker'})).status,200);
    assert.deepEqual(calls.at(-1),{path:'/rest/v1/rpc/champion_claim',body:{p_user:user,p_size:2,p_variant:'classic',p_name:'Name'}});
    const requestId='c3333333-3333-4333-8333-333333333333';
    assert.equal((await send({action:'rename',size:2,name:'Renamed'})).status,400);
    assert.equal((await send({action:'rename',size:2,name:'Renamed',requestId,price:0,user_id:'attacker'})).status,200);
    assert.deepEqual(calls.at(-1),{path:'/rest/v1/rpc/champion_rename',body:{p_user:user,p_size:2,p_name:'Renamed',p_reference:requestId}});
    assert.equal((await fetch(endpoint,{headers:{Authorization:'Bearer fixture'}})).status,200);
    assert.equal(calls.at(-1).path,'/rest/v1/rpc/champion_snapshot');
  }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
