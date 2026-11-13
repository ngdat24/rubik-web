import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,dirname,extname,sep} from 'node:path';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {invert} from '../packages/engine/dist/index.js';
import {createCloudHandler} from './cloud.mjs';
import {fakeDatabase} from './test-support.mjs';
const require=createRequire(new URL('../apps/web/package.json',import.meta.url));
const {chromium,expect}=require('@playwright/test');

test('two browsers: invite, shared inspection, offline completion, reload/ack, final score and forfeit',{timeout:90000},async()=>{
  const dir=mkdtempSync(join(tmpdir(),'rubik-race-'));let browser,server;
  try{
    const vite=join(dirname(require.resolve('vite/package.json')),'bin/vite.js');
    execFileSync(process.execPath,[vite,'build','--outDir',dir,'--emptyOutDir'],{cwd:resolve('apps/web'),env:{...process.env,VITE_SUPABASE_URL:'https://cloud-test.supabase.co',VITE_SUPABASE_ANON_KEY:'public-test'},stdio:'pipe'});
    const db=fakeDatabase(),ids=['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222'];
    ids.forEach((id,i)=>db.profiles.set(id,{id,name:['An','Bình'][i]}));
    const tokens=new Map();
    const handler=createCloudHandler({env:{SUPABASE_URL:'https://db.test',SUPABASE_ANON_KEY:'public-test',SUPABASE_SECRET_KEY:'sb_secret_test'},fetcher:(url,options)=>{
      if(new URL(url).pathname==='/auth/v1/user')return db.fetcher(url,{...options,headers:{...options.headers,Authorization:'Bearer '+tokens.get(options.headers.Authorization.slice(7))}});
      return db.fetcher(url,options);
    }});
    server=createServer((req,res)=>{
      if(req.url.startsWith('/api/'))return void handler(req,res);
      const file=resolve(dir,'.'+new URL(req.url,'http://localhost').pathname.replace(/^\/$/,'/index.html'));
      if(!file.startsWith(dir+sep)){res.writeHead(403);return res.end();}
      try{res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.html':'text/html'})[extname(file)]??'application/octet-stream');res.end(readFileSync(file));}catch{res.writeHead(404);res.end();}
    });
    await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
    browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
    const pages=[],contexts=[],errors=[];
    for(let i=0;i<2;i++){
      const id=ids[i],exp=Math.floor(Date.now()/1000)+3600;
      const token=[{alg:'HS256',typ:'JWT'},{sub:id,aud:'authenticated',role:'authenticated',exp,iat:exp-3600},'c2lnbmF0dXJl'].map(x=>typeof x==='string'?x:Buffer.from(JSON.stringify(x)).toString('base64url')).join('.');
      tokens.set(token,['token-a','token-b'][i]);
      const context=await browser.newContext({viewport:{width:1280,height:900}});contexts.push(context);
      await context.addInitScript(({token,id,exp})=>localStorage.setItem('sb-cloud-test-auth-token',JSON.stringify({access_token:token,refresh_token:'test',expires_at:exp,expires_in:3600,token_type:'bearer',user:{id,aud:'authenticated',role:'authenticated',email:'test@example.invalid'}})),{token,id,exp});
      const page=await context.newPage();pages.push(page);page.on('pageerror',e=>errors.push(e.message));
      await page.clock.install();await page.goto(base+'/race.html');await expect(page.locator('canvas')).toBeVisible();
      await expect(page.locator('#race-message')).toContainText('Tạo phòng');
      await page.locator('#race-fixed-keys').check();
    }
    const [a,b]=pages;
    await a.locator('#race-create').click();await expect(a.locator('#race-copy')).toBeEnabled();
    const id=await a.locator('#race-code').inputValue();await b.locator('#race-code').fill(id);await b.locator('#race-join').click();
    await expect(b.locator('#race-players li')).toHaveCount(2);
    await a.locator('#race-ready').click();await b.locator('#race-ready').click();
    await expect.poll(()=>db.rooms.get(id).start_ms).not.toBeNull();
    await expect(a.locator('#race-phase')).toContainText('Đếm ngược');
    assert.equal((await a.locator('#scramble-text').textContent()).includes('inspection'),true);
    db.advanceRace(3500);await Promise.all(pages.map(page=>page.clock.fastForward(3500)));
    await expect(a.locator('#race-phase')).toContainText('Inspection');await expect(b.locator('#race-phase')).toContainText('Inspection');
    await a.screenshot({path:resolve('test-results/race-desktop.png'),fullPage:true});
    await b.setViewportSize({width:390,height:844});
    assert.equal(await b.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await b.screenshot({path:resolve('test-results/race-mobile.png'),fullPage:true});
    await expect(a.locator('#scramble-text')).toHaveText(await b.locator('#scramble-text').textContent());
    const scramble=(await a.locator('#scramble-text').textContent()).trim().split(/\s+/);
    const press=async(page,moves)=>page.evaluate(moves=>{
      document.activeElement?.blur();
      for(const m of moves){const e=new KeyboardEvent('keydown',{code:'Key'+m[0].toUpperCase(),shiftKey:m.endsWith("'"),altKey:m.endsWith('2'),bubbles:true,cancelable:true});Object.defineProperty(e,'timeStamp',{value:performance.now()});window.dispatchEvent(e);}
    },moves);
    await press(a,['R']);
    assert.equal((await a.evaluate(()=>JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k=>k.startsWith('rubik.race.v1:')))))).events.length,0);
    db.advanceRace(15000);await Promise.all(pages.map(page=>page.clock.fastForward(15000)));
    await expect(a.locator('#race-phase')).toContainText('Đang giải');
    await contexts[0].setOffline(true);await press(a,invert(scramble,3));
    await expect(a.locator('#race-phase')).toContainText('khối 2');
    assert.equal(db.rooms.get(id).players[0].runs.length,0);
    await contexts[0].setOffline(false);await a.reload();
    await expect.poll(()=>db.rooms.get(id).players[0].runs.length).toBe(1);
    await expect(a.locator('#race-players')).toContainText('1 khối');
    // Re-POST the same receipt through the HTTP/auth/verification stack.
    const receipt=db.rooms.get(id).players[0].runs[0];
    const duplicate=await a.evaluate(async({id,run})=>{
      const auth=JSON.parse(localStorage.getItem('sb-cloud-test-auth-token'));
      const response=await fetch('/api/race',{method:'POST',headers:{Authorization:'Bearer '+auth.access_token,'Content-Type':'application/json'},body:JSON.stringify({action:'cube_done',id,run})});return {status:response.status,body:await response.json()};
    },{id,run:receipt});
    assert.equal(duplicate.status,200);assert.equal(duplicate.body.ack,0);assert.equal(db.rooms.get(id).players[0].runs.length,1);
    db.advanceRace(124000);await Promise.all(pages.map(page=>page.clock.fastForward(124000)));
    await expect(a.locator('#race-result')).toHaveText('Người thắng: An');await expect(b.locator('#race-result')).toHaveText('Người thắng: An');
    // Fresh room exercises explicit forfeit; old room remains immutable.
    await a.goto(base+'/race.html');await b.goto(base+'/race.html');
    await a.locator('#race-create').click();await expect(a.locator('#race-copy')).toBeEnabled();
    const second=await a.locator('#race-code').inputValue();await b.locator('#race-code').fill(second);await b.locator('#race-join').click();await expect(b.locator('#race-players li')).toHaveCount(2);
    await b.locator('#race-forfeit').click();await b.locator('#race-confirm-forfeit').click();
    await expect(b.locator('#race-result')).toHaveText('Người thắng: An');
    assert.equal(db.solves.size,0);assert.deepEqual(errors,[]);
  }finally{await browser?.close();if(server)await new Promise(r=>server.close(r));rmSync(dir,{recursive:true,force:true});}
});
