import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,dirname,extname,sep} from 'node:path';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {Cube,invert} from '../packages/engine/dist/index.js';
import {oneFaceSolved,raceComplete} from '../shared/race-rules.mjs';
import {createCloudHandler} from './cloud.mjs';
import {fakeDatabase} from './test-support.mjs';
const require=createRequire(new URL('../apps/web/package.json',import.meta.url));
const {chromium,expect}=require('@playwright/test');

test('two browsers: invite, shared inspection, offline completion, reload/ack, final score and forfeit',{timeout:90000},async()=>{
  const dir=mkdtempSync(join(tmpdir(),'rubik-race-'));let browser,server;
  try{
    const vite=join(dirname(require.resolve('vite/package.json')),'bin/vite.js');
    execFileSync(process.execPath,[vite,'build','--outDir',dir,'--emptyOutDir'],{cwd:resolve('apps/web'),env:{...process.env,VITE_SUPABASE_URL:'https://cloud-test.supabase.co',VITE_SUPABASE_ANON_KEY:'public-test'},stdio:'pipe'});
    const epoch=Date.now(),db=fakeDatabase({raceClock:()=>epoch}),ids=['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222'];
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
      if(i===1)db.profiles.delete(id);
      const token=[{alg:'HS256',typ:'JWT'},{sub:id,aud:'authenticated',role:'authenticated',exp,iat:exp-3600},'c2lnbmF0dXJl'].map(x=>typeof x==='string'?x:Buffer.from(JSON.stringify(x)).toString('base64url')).join('.');
      tokens.set(token,['token-a','token-b'][i]);
      const context=await browser.newContext({viewport:{width:1280,height:900}});contexts.push(context);
      await context.addInitScript(({token,id,exp})=>localStorage.setItem('sb-cloud-test-auth-token',JSON.stringify({access_token:token,refresh_token:'test',expires_at:exp,expires_in:3600,token_type:'bearer',user:{id,aud:'authenticated',role:'authenticated',email:'test@example.invalid'}})),{token,id,exp});
      const page=await context.newPage();pages.push(page);page.on('pageerror',e=>errors.push(e.message));
      const pollHook=()=>{
        const original=window.setTimeout;
        window.setTimeout=function(callback,delay,...args){
          if(delay===1000&&typeof callback==='function')window.racePoll=callback;
          return original.call(window,callback,delay,...args);
        };
      };
      await page.addInitScript(pollHook);
      await page.goto(base+'/race.html');
      if(i===1){
        // Initial WebGL setup and the profile request can take longer on CI's
        // software GPU; keep a bounded startup wait without relaxing match tests.
        try{await expect(page.locator('#race-name-dialog')).toBeVisible({timeout:15000});}
        catch(error){throw new Error(`${error.message}\nApp status: ${await page.locator('#race-message').textContent()}\nBrowser errors: ${JSON.stringify(errors)}`,{cause:error});}
        const submitName=async expectedStatus=>{
          // This form saves through fetch; wait for its ACK, not a navigation barrier.
          const [response]=await Promise.all([
            page.waitForResponse(r=>r.url().endsWith('/api/player')&&r.request().method()==='POST',{timeout:10000}),
            page.locator('#race-name-form button').click({noWaitAfter:true})
          ]);
          assert.equal(response.status(),expectedStatus,JSON.stringify(await response.json()));
        };
        await page.locator('#race-name').fill('An');await submitName(409);
        await expect(page.locator('#race-name-error')).toContainText('chọn tên khác');
        await page.locator('#race-name').fill('Bình');await submitName(200);
        await expect(page.locator('#race-name-dialog')).not.toBeVisible();
      }
      await expect(page.locator('#viewport canvas')).toBeVisible();await expect(page.locator('#opponent-viewport canvas')).toBeVisible();
      await expect(page.locator('#race-message')).toContainText('Tạo phòng');
      await page.locator('#race-fixed-keys').check();
      // Let Supabase auth/profile initialization finish with native timers.
      // The match clock is only needed after both pages have booted.
      await page.clock.install();
      await page.evaluate(pollHook);
      await page.addInitScript(pollHook);
    }
    // Freeze both browser clocks and the fake server. Slow screenshots or CI
    // scheduling must never consume inspection or alter captured event times.
    // Browser/runner clocks can differ, and a busy CI worker can take >100ms
    // to deliver a command. Jump ahead before creating the room; match time
    // has not started yet, so this consumes no countdown or inspection.
    await Promise.all(pages.map(async page=>page.clock.pauseAt(new Date(await page.evaluate(()=>Date.now())+60000))));
    const tick=async ms=>{
      if(ms>60000){await tick(60000);await tick(ms-60000);return;}
      const connected=pages.filter(page=>new URL(page.url()).searchParams.has('room'));
      const responses=connected.map(page=>page.waitForResponse(r=>r.url().includes('/api/race')&&r.status()===200));
      db.advanceRace(ms);await Promise.all(pages.map(page=>page.clock.fastForward(ms)));
      await Promise.all(connected.map(page=>page.evaluate(()=>window.racePoll())));
      await Promise.all(responses.map(p=>p.then(response=>response.finished())));
      db.advanceRace(32);await Promise.all(pages.map(page=>page.clock.runFor(32)));
    };
    const [a,b]=pages;
    const holdNextPoll=async(page,skipFirstPoll=false)=>{
      let release,entered=false;
      const hold=new Promise(resolve=>{release=resolve;});
      const matcher=url=>url.pathname==='/api/race'&&url.searchParams.has('id');
      const handler=async route=>{entered=true;await hold;await route.continue();};
      await page.route(matcher,handler,{times:1});
      // A busy sync can ignore a poll. With frozen browser clocks there is no
      // automatic next tick, so retry explicitly instead of waiting forever.
      // Exercise that no-op deterministically on the first ready test.
      if(skipFirstPoll)await page.evaluate(()=>{
        const original=window.racePoll;
        window.racePoll=()=>{window.racePoll=original;};
      });
      try{
        await expect.poll(async()=>{
          if(!entered)await page.evaluate(()=>window.racePoll());
          return entered;
        },{timeout:10000,message:'A race GET must enter the hold before testing queued input'}).toBe(true);
        return release;
      }catch(error){
        release();await page.unroute(matcher,handler);throw error;
      }
    };
    await a.locator('#race-create').click();await expect(a.locator('#race-copy')).toBeEnabled();
    const id=await a.locator('#race-code').inputValue();await b.locator('#race-code').fill(id);await b.locator('#race-join').click();
    assert.match(id,/^[A-Z0-9]{8}$/);await expect(a.locator('#race-forfeit')).toHaveCount(0);await expect(a.locator('#race-new')).toHaveCount(0);
    assert.equal(db.lobbies.get(id).duration_ms,180000);
    await expect(b.locator('#race-players li')).toHaveCount(2);
    const releaseReady=await holdNextPoll(a,true);
    await a.locator('#race-ready').click();assert.equal(db.lobbies.get(id).players[0].ready,false);
    await expect(a.locator('#race-ready')).toBeDisabled();await expect(a.locator('#race-message')).toContainText('Đang gửi sẵn sàng');
    releaseReady();await expect.poll(()=>db.lobbies.get(id).players[0].ready).toBe(true);
    await b.locator('#race-ready').click();
    await expect.poll(()=>db.lobbies.get(id).start_ms).not.toBeNull();
    await expect(a.locator('#race-ready')).toBeDisabled();await expect(b.locator('#race-ready')).toBeDisabled();
    await tick(1000);
    await expect(a.locator('#race-phase')).toContainText('Đếm ngược');
    assert.equal((await a.locator('#scramble-text').textContent()).includes('inspection'),true);
    await tick(2500);
    await expect(a.locator('#race-phase')).toContainText('Inspection');await expect(b.locator('#race-phase')).toContainText('Inspection');
    await a.screenshot({path:resolve('test-results/race-desktop.png'),fullPage:true});
    await b.setViewportSize({width:390,height:844});
    db.advanceRace(64);await Promise.all(pages.map(page=>page.clock.runFor(64)));
    assert.equal(await b.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await b.screenshot({path:resolve('test-results/race-mobile.png'),fullPage:true});
    await expect(a.locator('#scramble-text')).toHaveText(await b.locator('#scramble-text').textContent());
    const scramble=(await a.locator('#scramble-text').textContent()).trim().split(/\s+/);
    for(const page of pages){
      await expect(page.locator('#race-own-name')).toContainText(page===a?'An':'Bình');
      await expect(page.locator('#race-opponent-name')).toContainText(page===a?'Bình':'An');
      const left=await page.locator('#viewport').boundingBox(),right=await page.locator('#opponent-viewport').boundingBox();
      assert.ok(right.x>=left.x+left.width,'Own cube must remain left of opponent, including mobile');
    }
    const press=async(page,moves)=>page.evaluate(moves=>{
      document.activeElement?.blur();
      for(const m of moves){const e=new KeyboardEvent('keydown',{code:'Key'+m[0].toUpperCase(),shiftKey:m.endsWith("'"),altKey:m.endsWith('2'),bubbles:true,cancelable:true});Object.defineProperty(e,'timeStamp',{value:performance.now()});window.dispatchEvent(e);}
    },moves);
    await press(a,['R']);
    assert.equal((await a.evaluate(()=>JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k=>k.startsWith('rubik.race.v1:')))))).events.length,0);
    await tick(15000);
    await expect(a.locator('#race-phase')).toContainText('Đang giải');
    // Publish a partial move; the other browser must see the replayed state
    // without gaining score or changing its own local cube.
    const before=await b.locator('#opponent-viewport canvas').screenshot();
    await press(a,['R']);await tick(1000);await tick(1000);
    await expect(b.locator('#race-opponent-status')).toContainText('1 nước');
    assert.deepEqual(db.lobbies.get(id).players[0].live.state,Array.from(new Cube(3).applyMoves(scramble).applyMove('R').state));
    assert.equal(db.lobbies.get(id).players[0].runs.length,0);
    const after=await b.locator('#opponent-viewport canvas').screenshot();assert.notDeepEqual(before,after,'Opponent canvas must change with the received move');
    assert.equal(await b.evaluate(()=>JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k=>k.startsWith('rubik.race.v1:')))).events.length),0);
    await press(a,["R'"]);await tick(1000);
    await contexts[0].setOffline(true);await press(a,invert(scramble,3));
    db.advanceRace(32);await Promise.all(pages.map(page=>page.clock.runFor(32)));
    await expect(a.locator('#race-phase')).toContainText('khối 2');
    assert.equal(db.lobbies.get(id).players[0].runs.length,0);
    await contexts[0].setOffline(false);await a.reload();
    await expect.poll(()=>db.lobbies.get(id).players[0].runs.length).toBe(1);
    await expect(a.locator('#race-players')).toContainText('1 khối');
    // Re-POST the same receipt through the HTTP/auth/verification stack.
    const receipt=db.lobbies.get(id).players[0].runs[0];
    const duplicate=await a.evaluate(async({id,run,client,round})=>{
      const auth=JSON.parse(localStorage.getItem('sb-cloud-test-auth-token'));
      const response=await fetch('/api/race',{method:'POST',headers:{Authorization:'Bearer '+auth.access_token,'Content-Type':'application/json'},body:JSON.stringify({action:'cube_done',id,run,client,round})});return {status:response.status,body:await response.json()};
    },{id,run:receipt,client:db.lobbies.get(id).players[0].client,round:db.lobbies.get(id).round_id});
    assert.equal(duplicate.status,200);assert.equal(duplicate.body.ack,0);assert.equal(db.lobbies.get(id).players[0].runs.length,1);
    await tick(184000);
    await expect(a.locator('#race-result')).toHaveText('Người thắng: An');await expect(b.locator('#race-result')).toHaveText('Người thắng: An');
    // Reuse the SAME room and code; changing mode does not rewrite old scores.
    const previousRound=db.lobbies.get(id).round_id,previousSeed=db.lobbies.get(id).seed;
    await a.selectOption('#race-mode','oneFace');
    await tick(32);await expect(b.locator('#race-mode')).toHaveValue('oneFace');
    await a.locator('#race-rematch').click();await expect(a.locator('#race-rematch')).toBeDisabled();
    assert.equal(db.lobbies.get(id).round_id,previousRound);
    await b.locator('#race-rematch').click();await expect.poll(()=>db.lobbies.get(id).round_id).not.toBe(previousRound);
    assert.notEqual(db.lobbies.get(id).seed,previousSeed);const second=id;
    await tick(32);assert.equal(await a.locator('#race-code').inputValue(),id);assert.equal(await b.locator('#race-code').inputValue(),id);
    assert.equal(db.lobbies.size,1);assert.equal(db.lobbies.get(id).players[0].runs.length,0);
    await tick(1000);await tick(2500);await tick(15000);
    const faceScramble=(await a.locator('#scramble-text').textContent()).trim().split(/\s+/),partial=[],cube=new Cube(3).applyMoves(faceScramble);
    for(const move of invert(faceScramble,3)){partial.push(move);cube.applyMove(move);if(oneFaceSolved(cube.state))break;}
    assert.equal(cube.isSolved(),false);await press(a,partial);
    await expect.poll(()=>db.lobbies.get(second).players[0].runs.length).toBe(1);
    assert.equal(db.lobbies.get(second).players[0].runs[0].result,'face');await expect(a.locator('#race-players')).toContainText('1 khối');
    await tick(184000);await expect(a.locator('#race-result')).toContainText('Người thắng');
    await a.selectOption('#race-mode','f2lRush');await tick(32);await expect(b.locator('#race-mode')).toHaveValue('f2lRush');
    await a.locator('#race-rematch').click();await b.locator('#race-rematch').click();await tick(1000);await tick(2500);await tick(15000);
    assert.equal(db.lobbies.get(id).mode,'f2lRush');assert.equal(db.lobbies.size,1);
    const f2lScramble=(await a.locator('#scramble-text').textContent()).trim().split(/\s+/),f2lCube=new Cube(3).applyMoves(f2lScramble),f2lMoves=[];
    for(const m of invert(f2lScramble,3)){f2lCube.applyMove(m);f2lMoves.push(m);if(raceComplete(f2lCube.state,'f2lRush'))break;}
    await press(a,f2lMoves);await expect.poll(()=>db.lobbies.get(id).players[0].runs.length).toBe(1);
    await b.locator('#race-lobby-controls summary').click();
    const releaseLeave=await holdNextPoll(b);
    await b.locator('#race-leave').click();await b.locator('#race-confirm-forfeit').click();
    assert.equal(db.lobbies.get(second).forfeit,null);releaseLeave();
    await expect(b.locator('#race-message')).toHaveText('Đã rời phòng.');await tick(32);
    await expect(a.locator('#race-result')).toHaveText('Người thắng: An');assert.equal(db.lobbies.has(id),true);
    await a.locator('#race-leave').click();await a.locator('#race-confirm-forfeit').click();await expect(a.locator('#race-create')).toBeEnabled();
    assert.equal(db.lobbies.has(id),false);assert.equal(new URL(a.url()).search,'');
    // Regression: leaving then creating/joining never reuses the old invite.
    await a.locator('#race-create').click();await expect(a.locator('#race-copy')).toBeEnabled();const third=await a.locator('#race-code').inputValue();assert.notEqual(third,id);
    await b.locator('#race-code').fill(third);await b.locator('#race-join').click();await expect(b.locator('#race-players li')).toHaveCount(2);
    // Navigation sends a short departure lease; another member remains in room.
    await b.goto(base+'/');db.advanceRace(6000);await a.clock.fastForward(6000);await a.evaluate(()=>window.racePoll());
    await expect.poll(()=>db.lobbies.get(third).players.find(p=>p.id===ids[1]).present).toBe(false);
    const lastClient=db.lobbies.get(third).players.find(p=>p.id===ids[0]).client;
    await a.close();db.advanceRace(90001);
    const closed=await db.fetcher('https://db.test/rest/v1/rpc/lobby_action',{body:JSON.stringify({p_user:ids[0],p_code:third,p_action:'get',p_payload:{client:lastClient}})});
    assert.equal((await closed.json()).gone,true);assert.equal(db.lobbies.has(third),false);
    assert.equal(db.solves.size,0);assert.deepEqual(errors,[]);
  }finally{await browser?.close();if(server)await new Promise(r=>server.close(r));rmSync(dir,{recursive:true,force:true});}
});
