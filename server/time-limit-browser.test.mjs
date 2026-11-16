import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,dirname,extname,sep} from 'node:path';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {Cube,invert} from '../packages/engine/dist/index.js';
import {raceComplete} from '../shared/race-rules.mjs';
import {createCloudHandler} from './cloud.mjs';
import {fakeDatabase} from './test-support.mjs';
const require=createRequire(new URL('../apps/web/package.json',import.meta.url));
const {chromium,expect}=require('@playwright/test');

test('Time Limit: three solo modes, offline resume, deadline, cancellation and category leaderboard',{timeout:90000},async()=>{
  const dir=mkdtempSync(join(tmpdir(),'rubik-time-limit-'));let browser,server;
  try{
    const vite=join(dirname(require.resolve('vite/package.json')),'bin/vite.js');
    execFileSync(process.execPath,[vite,'build','--outDir',dir,'--emptyOutDir'],{cwd:resolve('apps/web'),env:{...process.env,VITE_SUPABASE_URL:'https://cloud-test.supabase.co',VITE_SUPABASE_ANON_KEY:'public-test'},stdio:'pipe'});
    const epoch=Date.now(),db=fakeDatabase({raceClock:()=>epoch}),id='11111111-1111-4111-8111-111111111111';db.profiles.set(id,{id,name:'An Time Limit'});
    const exp=Math.floor(epoch/1000)+3600,token=[{alg:'HS256',typ:'JWT'},{sub:id,aud:'authenticated',role:'authenticated',exp,iat:exp-3600},'c2lnbmF0dXJl'].map(x=>typeof x==='string'?x:Buffer.from(JSON.stringify(x)).toString('base64url')).join('.');
    const handler=createCloudHandler({env:{SUPABASE_URL:'https://db.test',SUPABASE_ANON_KEY:'public-test',SUPABASE_SECRET_KEY:'sb_secret_test'},fetcher:(url,options)=>{
      if(new URL(url).pathname==='/auth/v1/user')return db.fetcher(url,{...options,headers:{...options.headers,Authorization:'Bearer anonymous-a'}});
      return db.fetcher(url,options);
    }});
    server=createServer((req,res)=>{
      if(req.url.startsWith('/api/'))return void handler(req,res);
      const file=resolve(dir,'.'+new URL(req.url,'http://localhost').pathname.replace(/^\/$/,'/index.html'));
      if(!file.startsWith(dir+sep)){res.writeHead(403);return res.end();}
      try{res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.html':'text/html'})[extname(file)]??'application/octet-stream');res.end(readFileSync(file));}catch{res.writeHead(404);res.end();}
    });
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
    browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
    const context=await browser.newContext({viewport:{width:1440,height:1000}});
    await context.addInitScript(({id,token,exp})=>localStorage.setItem('sb-cloud-test-auth-token',JSON.stringify({access_token:token,refresh_token:'test',expires_at:exp,expires_in:3600,token_type:'bearer',user:{id,aud:'authenticated',role:'authenticated',is_anonymous:true}})),{id,token,exp});
    const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.clock.install();await page.addInitScript(()=>{const original=window.setTimeout;window.setTimeout=function(callback,delay,...args){if(delay===1000&&typeof callback==='function')window.timeLimitPoll=callback;return original.call(window,callback,delay,...args);};});
    await page.goto(base+'/time-limit.html');await expect(page.locator('#viewport canvas')).toBeVisible();await expect(page.locator('#race-message')).toContainText('Chọn danh mục');await expect(page.locator('#opponent-viewport')).toHaveCount(0);
    await page.locator('#race-fixed-keys').check();await page.clock.pauseAt(new Date(await page.evaluate(()=>Date.now())+60000));
    const tick=async ms=>{
      const response=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/time-limit'&&r.status()===200);
      db.advanceRace(ms);await page.clock.fastForward(ms);await page.evaluate(()=>window.timeLimitPoll());await (await response).finished();
      db.advanceRace(32);await page.clock.runFor(32);
    };
    const press=moves=>page.evaluate(moves=>{document.activeElement?.blur();for(const m of moves){const e=new KeyboardEvent('keydown',{code:'Key'+m[0].toUpperCase(),shiftKey:m.endsWith("'"),altKey:m.endsWith('2'),bubbles:true,cancelable:true});Object.defineProperty(e,'timeStamp',{value:performance.now()});window.dispatchEvent(e);}},moves);
    const solve=async mode=>{
      const scramble=(await page.locator('#scramble-text').textContent()).trim().split(/\s+/),cube=new Cube(3).applyMoves(scramble),moves=[];
      for(const m of invert(scramble,3)){cube.applyMove(m);moves.push(m);if(raceComplete(cube.state,mode))break;}
      await press(moves);
    };
    for(const mode of ['oneFace','f2lRush','fullSolve']){
      let releaseCreate;
      if(mode==='oneFace'){
        const held=new Promise(resolve=>{releaseCreate=resolve;});
        await page.route(url=>url.pathname==='/api/time-limit'&&!url.search,async route=>{await held;await route.continue();},{times:1});
      }
      await page.selectOption('#race-mode',mode);await page.locator('#race-create').focus();await page.keyboard.press('Space');
      await expect(page.locator('#race-create')).toBeDisabled();await expect(page.locator('#race-mode')).toBeDisabled();
      if(releaseCreate){await expect(page.locator('#race-message')).toContainText('Đang bắt đầu');releaseCreate();}
      await expect(page.locator('#race-message')).toContainText('Đã kết nối');
      const session=new URL(page.url()).searchParams.get('session');assert.ok(session);assert.equal(db.timeLimits.get(session).duration_ms,180000);
      assert.equal((await page.locator('#scramble-text').textContent()).includes('inspection'),true);
      await tick(1000);await expect(page.locator('#race-phase')).toContainText('Đếm ngược');await tick(2500);await expect(page.locator('#race-phase')).toContainText('Inspection');
      await press(['R']);assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k=>k.startsWith('rubik.time-limit.v1:')))).events.length),0);
      if(mode==='oneFace')await page.screenshot({path:resolve('test-results/time-limit-desktop.png'),fullPage:true});
      await tick(15000);await expect(page.locator('#race-phase')).toContainText('Đang giải');const before=await page.locator('#scramble-text').textContent();
      await solve(mode);await expect.poll(()=>db.timeLimits.get(session).runs.length).toBe(1);await expect(page.locator('#scramble-text')).not.toHaveText(before);
      if(mode==='oneFace'){
        await context.setOffline(true);await solve(mode);assert.equal(db.timeLimits.get(session).runs.length,1);
        await context.setOffline(false);await page.reload();await expect.poll(()=>db.timeLimits.get(session).runs.length).toBe(2);await page.locator('#race-fixed-keys').check();
      }
      await tick(184000);await expect(page.locator('#race-result')).toContainText('Đã chốt');await expect(page.locator('#race-create')).toBeEnabled();
      await expect(page.locator('#time-limit-rows')).toContainText('An Time Limit');
    }
    for(const mode of ['oneFace','f2lRush','fullSolve']){await page.locator(`[data-time-mode="${mode}"]`).click();await expect(page.locator('#time-limit-rows tr')).toHaveCount(1);await expect(page.locator('#time-limit-rows')).toContainText('An Time Limit');}
    await page.setViewportSize({width:390,height:844});await page.locator('#viewport canvas').scrollIntoViewIfNeeded();db.advanceRace(64);await page.clock.runFor(64);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:resolve('test-results/time-limit-mobile.png'),fullPage:true});
    await page.selectOption('#race-mode','oneFace');await page.locator('#race-create').click();await expect(page.locator('#race-create')).toBeDisabled();await expect(page.locator('#race-message')).toContainText('Đã kết nối');const canceled=new URL(page.url()).searchParams.get('session');
    let release,entered;const hold=new Promise(resolve=>{release=resolve;}),started=new Promise(resolve=>{entered=resolve;});
    await page.route(url=>url.pathname==='/api/time-limit'&&url.searchParams.has('id'),async route=>{entered();await hold;await route.continue();},{times:1});
    await page.evaluate(()=>window.timeLimitPoll());await started;await page.locator('#race-forfeit').click();await page.locator('#race-confirm-forfeit').click();assert.equal(db.timeLimits.get(canceled).abandoned,false);release();
    await expect(page.locator('#race-result')).toContainText('Đã hủy');assert.equal(db.timeLimits.get(canceled).abandoned,true);
    assert.equal(db.solves.size,0);assert.equal(db.rooms.size,0);assert.deepEqual(errors,[]);
    await page.goto(base+'/');await expect(page.locator('#account-open')).toHaveText('Hồ sơ');await expect(page.locator('#solve-history li')).toHaveCount(0);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Practice navigation must still fit mobile with the profile button');
  }finally{await browser?.close();if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}rmSync(dir,{recursive:true,force:true});}
});
