import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createCloudHandler} from './cloud.mjs';

const url = 'https://auth-fixture.test';
const env = {
  ACCOUNT_LOGIN_ENABLED:'1', SUPABASE_URL:url, SUPABASE_ANON_KEY:'public-fixture',
  SUPABASE_SERVICE_ROLE_KEY:'service-fixture',
};

async function signIn({name, password, known=true, allowed=true, valid=true, enabled=true}) {
  const calls = [];
  const handler = createCloudHandler({env:{...env, ACCOUNT_LOGIN_ENABLED:enabled?'1':'0'}, fetcher:async (target, options) => {
    const path = target.slice(url.length);
    const body = JSON.parse(options.body);
    calls.push({path,body,key:options.headers.apikey});
    if(path.endsWith('/consume_account_login_quota'))return Response.json(allowed);
    if(path.endsWith('/account_login_email'))return Response.json(known?'fixture@example.test':null);
    if(path.endsWith('grant_type=password'))return valid&&known
      ? Response.json({access_token:'access',refresh_token:'refresh',user:{email:'fixture@example.test'}})
      : Response.json({error:'upstream detail'}, {status:400});
    throw new Error('Unexpected upstream request');
  }});
  let result;
  const res = {setHeader(){},end(value){result={status:this.statusCode,body:JSON.parse(value)};}};
  await handler({headers:{host:'rubik.test'},method:'POST',url:'/api/session-login',body:{name,password},socket:{remoteAddress:'127.0.0.1'}},res);
  return {result,calls};
}

test('signs in with a normalized name while keeping the email lookup private', async () => {
  const {result,calls}=await signIn({name:'  Dragon_1 ',password:'fixture pass'});
  assert.deepEqual(result,{status:200,body:{access_token:'access',refresh_token:'refresh'}});
  assert.deepEqual(calls[1].body,{p_name:'dragon_1'});
  assert.equal(calls[1].key,'service-fixture');
  assert.equal(calls[2].key,'public-fixture');
  assert.match(calls[0].body.p_ip,/^[0-9a-f]{64}$/);
  assert.match(calls[0].body.p_name,/^[0-9a-f]{64}$/);
});

test('bad credentials do not reveal whether a name exists, and rate limiting runs first', async () => {
  const input={name:'dragon_1',password:'incorrect'};
  const unknown=await signIn({...input,known:false});
  const invalid=await signIn({...input,valid:false});
  assert.deepEqual(unknown.result,invalid.result);
  assert.equal(unknown.result.status,401);
  const limited=await signIn({...input,allowed:false});
  assert.equal(limited.result.status,429);
  assert.equal(limited.calls.length,1);
  const disabled=await signIn({...input,enabled:false});
  assert.equal(disabled.result.status,404);
  assert.equal(disabled.calls.length,0);
});
