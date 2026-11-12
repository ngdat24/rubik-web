import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,dirname,extname,sep} from 'node:path';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {createCloudHandler} from './cloud.mjs';
import {fakeDatabase} from './test-support.mjs';
const require=createRequire(new URL('../apps/web/package.json',import.meta.url));
const {chromium,expect}=require('@playwright/test');

test('cloud account login, auto upload, cross-device history and logout isolation', {timeout:120000},async()=>{
  const dir=mkdtempSync(join(tmpdir(),'rubik-cloud-'));
  let browser,server;
  try{
    const vite=join(dirname(require.resolve('vite/package.json')),'bin/vite.js');
    execFileSync(process.execPath,[vite,'build','--outDir',dir,'--emptyOutDir'],{cwd:resolve('apps/web'),env:{...process.env,VITE_SUPABASE_URL:'https://cloud-test.supabase.co',VITE_SUPABASE_ANON_KEY:'public-test'},stdio:'pipe'});
    const db=fakeDatabase();
    const env={SUPABASE_URL:'https://db.test',SUPABASE_ANON_KEY:'public-test',SUPABASE_SERVICE_ROLE_KEY:'private-test'};
    // Browser JWTs stand in for Supabase Auth only; API tests separately assert server identity checks.
    const idA='11111111-1111-4111-8111-111111111111',idB='22222222-2222-4222-8222-222222222222';
    const tokens=new Map();
    const handler=createCloudHandler({env,fetcher:(url,options)=>{if(new URL(url).pathname==='/auth/v1/user'){const token=options.headers.Authorization.slice(7);return db.fetcher(url,{...options,headers:{...options.headers,Authorization:'Bearer '+tokens.get(token)}});}return db.fetcher(url,options);}});
    server=createServer((req,res)=>{
      if(req.url.startsWith('/api/'))return void handler(req,res);
      const file=resolve(dir,'.'+new URL(req.url,'http://localhost').pathname.replace(/^\/$/,'/index.html'));
      if(!file.startsWith(dir+sep)){res.writeHead(403);return res.end();}
      try{const content=readFileSync(file);res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.html':'text/html'})[extname(file)]??'application/octet-stream');res.end(content);}catch{res.writeHead(404);res.end();}
    });
    await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
    browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
    const create=async(email)=>{
      const context=await browser.newContext({viewport:{width:1440,height:1000}});
      await context.addInitScript(()=>{
        const original=window.setInterval;window.rubikPollers=[];
        window.setInterval=function(callback,delay,...args){if(delay===30000)window.rubikPollers.push(()=>callback(...args));return original.call(window,callback,delay,...args);};
      });
      await context.route('https://cloud-test.supabase.co/**',async route=>{
        const path=new URL(route.request().url()).pathname;
        const headers={'access-control-allow-origin':base,'access-control-allow-methods':'GET, POST, PUT, DELETE, OPTIONS','access-control-allow-headers':route.request().headers()['access-control-request-headers']??'authorization, apikey, content-type, x-client-info, x-supabase-api-version'};
        const fulfill=options=>route.fulfill({...options,headers});
        if(route.request().method()==='OPTIONS')return fulfill({status:204});
        if(path.endsWith('/logout'))return fulfill({status:204});
        if(path.endsWith('/recover'))return fulfill({json:{}});
        const id=email==='a@example.test'?idA:idB;
        const user={id,email,aud:'authenticated',role:'authenticated',email_confirmed_at:'2026-11-13T00:00:00Z',app_metadata:{provider:'email'},user_metadata:{},created_at:'2026-11-13T00:00:00Z'};
        const exp=Math.floor(Date.now()/1000)+3600;
        const token=[{alg:'HS256',typ:'JWT'},{sub:id,aud:'authenticated',role:'authenticated',email,exp,iat:exp-3600},'c2lnbmF0dXJl'].map(v=>typeof v==='string'?v:Buffer.from(JSON.stringify(v)).toString('base64url')).join('.');tokens.set(token,id===idA?'token-a':'token-b');
        if(path.endsWith('/user'))return fulfill({json:user});
        if(path.endsWith('/signup'))return fulfill({json:user});
        return fulfill({json:{access_token:token,refresh_token:'refresh-'+id,expires_in:3600,expires_at:exp,token_type:'bearer',user}});
      });
      const page=await context.newPage();const diagnostics=[];page.on('pageerror',e=>diagnostics.push(e.message));page.on('console',m=>{if(m.type()==='error')diagnostics.push(m.text());});await page.goto(base);await expect(page.locator('canvas')).toBeVisible();await page.locator('#account-open').click();
      await page.locator('#account-email').fill(email);await page.locator('#account-password').fill('test-password');
      await Promise.all([page.waitForNavigation({waitUntil:'domcontentloaded'}),page.locator('#account-form button[type=submit]').click()]);
      await expect(page.locator('#cloud-sync')).toBeVisible();
      try{await expect(page.locator('#account-open')).toHaveText('Tài khoản');}catch(e){throw new Error(String(e)+' Diagnostics: '+JSON.stringify({errors:diagnostics,message:await page.locator('#account-message').textContent(),cloud:await page.locator('#cloud-message').textContent()}));}return {context,page};
    };
    const {context,page}=await create('a@example.test');const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await expect(page.locator('#player-dialog')).toBeVisible();await page.locator('#player-name').fill('An online');await page.locator('#player-form button[type=submit]').click();await expect(page.locator('#player-dialog')).not.toBeVisible();
    await page.selectOption('#cube-size','2');await page.locator('#workspace-tools summary').click();await page.locator('#instant').check();await page.locator('#view-keys').check();
    await page.locator('#scramble').click();const moves=(await page.locator('#scramble-text').textContent()).trim().split(/\s+/);await page.locator('#timer-start').click();await context.setOffline(true);
    for(const move of moves.reverse())await page.keyboard.press(move.endsWith('2')?'Alt+'+move[0].toLowerCase():move.endsWith("'")?move[0].toLowerCase():'Shift+'+move[0].toLowerCase());
    await expect(page.locator('#solve-history li')).toHaveCount(1);await expect.poll(()=>page.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('rubik.cloud.pending.')).length)).toBe(1);
    await context.setOffline(false);await page.reload();await page.selectOption('#cube-size','2');await expect.poll(()=>db.solves.size).toBe(1);
    await page.locator('#solve-history li').getByRole('button',{name:'+2',exact:true}).click();await expect.poll(()=>[...db.solves.values()][0]?.penalty_override).toBe('+2');
    const second=await create('a@example.test');await expect(second.page.locator('#player-label')).toHaveText('An online');await second.page.selectOption('#cube-size','2');await expect(second.page.locator('#solve-history li')).toHaveCount(1);await expect(second.page.locator('#solve-history li')).toContainText('đã chỉnh');
    await second.page.selectOption('#leaderboard-size','2');await expect(second.page.locator('#leaderboard-rows')).toContainText('An online');
    await expect(second.page.locator('#cloud-sync')).toBeEnabled();
    const unchanged=second.page.waitForResponse(r=>r.url().includes('/api/solves?since=')&&r.request().method()==='GET');await second.page.locator('#cloud-sync').click();
    const delta=await (await unchanged).json();assert.equal(delta.rows.length,0);assert.ok(delta.cursor>0);
    await expect(second.page.locator('#cloud-sync')).toBeEnabled();
    const requests=[];second.page.on('request',r=>{if(r.url().startsWith(base+'/api/'))requests.push(r.url());});
    await second.page.evaluate(async()=>{Object.defineProperty(document,'hidden',{get:()=>true,configurable:true});for(const tick of window.rubikPollers)tick();window.dispatchEvent(new Event('online'));await new Promise(r=>setTimeout(r,100));});
    assert.equal(requests.length,0);
    const resumed=second.page.waitForResponse(r=>r.url().includes('/api/solves?since='));
    await second.page.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));});await resumed;
    await page.bringToFront();await page.locator('#solve-history li').getByRole('button',{name:'DNF',exact:true}).click();await expect.poll(()=>[...db.solves.values()][0]?.penalty_override).toBe('DNF');
    const changed=second.page.waitForResponse(r=>r.url().includes('/api/solves?since='+delta.cursor));await second.page.bringToFront();await second.page.locator('#cloud-sync').click();
    const changedRows=(await (await changed).json()).rows;assert.equal(changedRows.length,1);assert.equal(changedRows[0].penalty_override,'DNF');
    await expect(second.page.locator('#solve-history li')).toContainText('phạt DNF');
    await page.bringToFront();
    await page.locator('#account-open').click();await page.locator('#account-signout').click();await expect(page.locator('#account-open')).toHaveText('Đăng nhập');await expect(page.locator('#solve-history li')).toHaveCount(0);
    await page.selectOption('#leaderboard-size','2');await expect(page.locator('#leaderboard-rows')).toContainText('An online');
    await second.page.bringToFront();await second.page.locator('#solve-history li').getByRole('button',{name:'Xóa',exact:true}).click();await expect.poll(()=>[...db.solves.values()][0]?.deleted).toBe(true);
    const third=await create('b@example.test');await expect(third.page.locator('#player-dialog')).toBeVisible();await third.page.locator('#player-close').click();await third.page.selectOption('#cube-size','2');await expect(third.page.locator('#solve-history li')).toHaveCount(0);
    await third.page.locator('#account-open').click();await third.page.locator('#account-signout').click();await expect(third.page.locator('#account-open')).toHaveText('Đăng nhập');
    await third.page.locator('#account-open').click();await third.page.selectOption('#account-mode','signup');await third.page.locator('#account-email').fill('b@example.test');await third.page.locator('#account-password').fill('test-password');await third.page.locator('#account-form button[type=submit]').click();await expect(third.page.locator('#account-message')).toContainText('Kiểm tra email');
    await third.page.selectOption('#account-mode','reset');await third.page.locator('#account-password').fill('');await third.page.locator('#account-form button[type=submit]').click();await expect(third.page.locator('#account-message')).toContainText('email khôi phục');
    await third.page.goto(base+'/?code=recovery-test');await expect(third.page.locator('#account-dialog')).toBeVisible();await expect(third.page.locator('#account-mode')).toHaveValue('password');await third.page.locator('#account-password').fill('new-test-password');await third.page.locator('#account-form button[type=submit]').click();await expect(third.page.locator('#account-message')).toContainText('Đã đổi mật khẩu');
    assert.deepEqual(errors,[]);await context.close();await second.context.close();await third.context.close();
  }finally{await browser?.close();if(server)await new Promise(r=>{server.closeAllConnections();server.close(r);});rmSync(dir,{recursive:true,force:true});}
});
