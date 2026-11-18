import {test} from 'node:test';import assert from 'node:assert/strict';import {createServer} from 'node:http';import {createCloudHandler} from './cloud.mjs';
test('public navigation exposes only active season end and caches response',async()=>{
 let path;const server=createServer(createCloudHandler({env:{SUPABASE_URL:'https://db.test',SUPABASE_ANON_KEY:'public',SUPABASE_SERVICE_ROLE_KEY:'private'},fetcher:async url=>{path=String(url);return Response.json([{ends_at:'2026-12-08T17:00:00Z'}]);}}));
 await new Promise(r=>server.listen(0,'127.0.0.1',r));try{
 const response=await fetch('http://127.0.0.1:'+server.address().port+'/api/navigation-season');assert.equal(response.status,200);assert.deepEqual(await response.json(),{endsAt:'2026-12-08T17:00:00Z'});assert.match(path,/select=ends_at/);assert.match(path,/starts_at=lte/);assert.match(path,/ends_at=gt/);assert.match(response.headers.get('cache-control'),/s-maxage=60/);
 }finally{server.close();}
});
