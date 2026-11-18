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

test('name-only profile, uniqueness, persistent session, offline sync and private history', {timeout:120000},async()=>{
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
    const authCreates=[];
    const create=async(email,storageState)=>{
      const context=await browser.newContext({viewport:{width:1440,height:1000},...(storageState?{storageState}:{})});
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
        const user={id,email,aud:'authenticated',role:'authenticated',is_anonymous:true,app_metadata:{provider:'anonymous'},user_metadata:{},created_at:'2026-11-13T00:00:00Z'};
        const exp=Math.floor(Date.now()/1000)+3600;
        const token=[{alg:'HS256',typ:'JWT'},{sub:id,aud:'authenticated',role:'authenticated',email,exp,iat:exp-3600},'c2lnbmF0dXJl'].map(v=>typeof v==='string'?v:Buffer.from(JSON.stringify(v)).toString('base64url')).join('.');tokens.set(token,id===idA?'anonymous-a':'anonymous-b');
        if(path.endsWith('/user'))return fulfill({json:user});
        if(path.endsWith('/signup')){assert.equal(route.request().postDataJSON().email,undefined);assert.equal(route.request().postDataJSON().password,undefined);authCreates.push(id);}
        return fulfill({json:{access_token:token,refresh_token:'refresh-'+id,expires_in:3600,expires_at:exp,token_type:'bearer',user}});
      });
      const page=await context.newPage();await page.goto(base);await expect(page.locator('canvas')).toBeVisible();
      await expect(page.locator('#cloud-sync')).toBeVisible();await expect(page.locator('#account-open')).toHaveText('Hồ sơ');
      await expect(page.locator('input[type=email],input[type=password],#account-signout,#account-mode')).toHaveCount(0);
      return {context,page};
    };
    const {context,page}=await create('a@example.test');const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await expect(page.locator('#player-dialog')).toBeVisible();await page.locator('#player-name').fill('An online');await page.locator('#player-form button[type=submit]').click();await expect(page.locator('#player-dialog')).not.toBeVisible();
    await page.selectOption('#cube-size','2');await page.locator('#workspace-tools summary').click();await page.locator('#instant').check();await page.locator('#view-keys').check();
    await page.locator('#scramble').click();const moves=(await page.locator('#scramble-text').textContent()).trim().split(/\s+/);await page.locator('#timer-start').click();await context.setOffline(true);
    for(const move of moves.reverse())await page.keyboard.press(move.endsWith('2')?'Alt+'+move[0].toLowerCase():move.endsWith("'")?move[0].toLowerCase():'Shift+'+move[0].toLowerCase());
    await expect(page.locator('#solve-history li')).toHaveCount(1);await expect.poll(()=>page.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('rubik.cloud.pending.')).length)).toBe(1);
    await context.setOffline(false);await page.reload();await page.selectOption('#cube-size','2');await expect.poll(()=>db.solves.size).toBe(1);
    await page.locator('#solve-history li').getByRole('button',{name:'+2',exact:true}).click();await expect.poll(()=>[...db.solves.values()][0]?.penalty_override).toBe('+2');
    const second=await create('a@example.test',await context.storageState());await expect(second.page.locator('#player-label')).toHaveText('An online');await second.page.selectOption('#cube-size','2');await expect(second.page.locator('#solve-history li')).toHaveCount(1);await expect(second.page.locator('#solve-history li')).toContainText('đã chỉnh');
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
    await second.page.bringToFront();await second.page.locator('#solve-history li').getByRole('button',{name:'Xóa',exact:true}).click();await expect.poll(()=>[...db.solves.values()][0]?.deleted).toBe(true);
    const third=await create('b@example.test');await expect(third.page.locator('#player-dialog')).toBeVisible();
    await third.page.locator('#player-name').fill('an online');await third.page.locator('#player-form button[type=submit]').click();
    await expect(third.page.locator('#player-error')).toContainText('chọn tên khác');await expect(third.page.locator('#player-dialog')).toBeVisible();
    await third.page.locator('#player-name').fill('Bình online');await third.page.locator('#player-form button[type=submit]').click();
    await expect(third.page.locator('#player-dialog')).not.toBeVisible();await third.page.selectOption('#cube-size','2');await expect(third.page.locator('#solve-history li')).toHaveCount(0);
    await third.page.reload();await expect(third.page.locator('#player-label')).toHaveText('Bình online');
    assert.equal(authCreates.length,2,'Reload or restored session created a replacement identity');
    await third.page.locator('#account-open').click();await expect(third.page.locator('#account-dialog')).toBeVisible();
    await third.page.locator('#account-close').click();
    assert.deepEqual(errors,[]);await context.close();await second.context.close();await third.context.close();
  }finally{await browser?.close();if(server)await new Promise(r=>{server.closeAllConnections();server.close(r);});rmSync(dir,{recursive:true,force:true});}
});


test('shop translates catalogue, preview, confirmation and season in English', {timeout:60000},async()=>{
  const dir=mkdtempSync(join(tmpdir(),'rubik-shop-language-'));
  let browser,server;
  try{
    const vite=join(dirname(require.resolve('vite/package.json')),'bin/vite.js');
    execFileSync(process.execPath,[vite,'build','--outDir',dir,'--emptyOutDir'],{cwd:resolve('apps/web'),env:{...process.env,VITE_SUPABASE_URL:'https://shop-test.supabase.co',VITE_SUPABASE_ANON_KEY:'public-test'},stdio:'pipe'});
    const catalogue=JSON.parse(readFileSync('supabase/migrations/20261117011000_hydrogen_skin_catalog.sql','utf8').split('$catalog$')[1]);
    const skins=catalogue.map(s=>({id:s.skin_id,name:s.name,tier:s.tier,appearance:{body:s.body,layers:s.layers,interaction_fx:s.interaction_fx}}));
    const state={cb:10000,zn:30,rerolls:0,catalog:{reroll:[50],crates:{},utilities:{},wheel:{single:1,batches:[1,5,10],bands:[]}},
      offers:[{id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',tier:'white',skin:skins[0],price:300,currency:'CB',purchased:false}],
      inventory:skins.slice(1).map(skin=>({id:skin.id,kind:'skin',equipped:false,skin})),result:[{skin:skins[0]}],crates:{},
      season:{id:'season_01',name:'Kỷ Nguyên Từ Trường & Lượng Tử',endsAt:'2026-12-08T16:59:59Z',spins:0,milestones:[]}};
    const nameRequests=[];const red=state.inventory.find(item=>item.id==='s1_red_crimson_core');red.customName='Original';red.nameRequired=false;
    const db=fakeDatabase();const id='11111111-1111-4111-8111-111111111111';db.profiles.set(id,{id,name:'Fixture Player'});
    const handler=createCloudHandler({env:{SUPABASE_URL:'https://db.test',SUPABASE_ANON_KEY:'public-test',SUPABASE_SERVICE_ROLE_KEY:'private-test'},
      fetcher:(url,options)=>db.fetcher(url,new URL(url).pathname==='/auth/v1/user'?{...options,headers:{...options.headers,Authorization:'Bearer anonymous-a'}}:options)});
    server=createServer(async(req,res)=>{
      if(req.url.startsWith('/api/champion')){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({awards:[]}));}
      if(req.url.startsWith('/api/shop')){
        if(req.method==='POST'){let text='';for await(const chunk of req)text+=chunk;const action=JSON.parse(text);
          if(action.action==='name_prometheus'){nameRequests.push(action);red.customName=action.name;state.cb-=500;}}
        res.setHeader('Content-Type','application/json');return res.end(JSON.stringify(state));}
      if(req.url.startsWith('/api/'))return void handler(req,res);
      const file=resolve(dir,'.'+new URL(req.url,'http://localhost').pathname.replace(/^\/$/,'/index.html'));
      if(!file.startsWith(dir+sep)){res.writeHead(403);return res.end();}
      try{res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.html':'text/html'})[extname(file)]??'application/octet-stream');res.end(readFileSync(file));}catch{res.writeHead(404);res.end();}
    });
    await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
    browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
    const page=await browser.newPage({viewport:{width:1280,height:900}});
    await page.route('https://shop-test.supabase.co/**',async route=>{
      const user={id,aud:'authenticated',role:'authenticated',is_anonymous:true,app_metadata:{provider:'anonymous'},user_metadata:{},created_at:'2026-11-17T00:00:00Z'};
      const exp=Math.floor(Date.now()/1000)+3600;
      const access_token=[{alg:'HS256',typ:'JWT'},{sub:id,aud:'authenticated',role:'authenticated',exp,iat:exp-3600},'c2lnbmF0dXJl'].map(x=>typeof x==='string'?x:Buffer.from(JSON.stringify(x)).toString('base64url')).join('.');
      await route.fulfill({json:{access_token,refresh_token:'fixture-refresh',expires_in:3600,expires_at:exp,token_type:'bearer',user},headers:{'access-control-allow-origin':'*'}});
    });
    await page.goto(base+'/?lang=en');await expect(page.locator('#player-label')).toHaveText('Fixture Player');
    await page.locator('#shop-open').click();await expect(page.locator('.shop-card h3')).toHaveText('Standard Matte Pastel');
    await expect(page.locator('.shop-prizes')).toContainText('Standard Matte Pastel');
    await page.locator('.shop-card').getByRole('button',{name:'300 CB',exact:true}).click();
    await expect(page.locator('#shop-confirmation')).toContainText('Standard Matte Pastel');
    await page.locator('#shop-confirmation').getByRole('button',{name:'Cancel',exact:true}).click();
    await page.getByRole('button',{name:'Try on the 3D cube',exact:true}).click();
    await expect(page.locator('#shop-preview-title')).toHaveText('Standard Matte Pastel');
    await expect(page.locator('#shop-preview-cube canvas')).toBeVisible();
    await page.locator('#shop-preview-close').click();
    await page.locator('#shop-tabs').getByRole('button',{name:'Inventory',exact:true}).click();
    await expect(page.locator('.shop-card')).toHaveCount(29);
    assert.doesNotMatch(await page.locator('#shop-content').innerText(),/[ăâđêôơưĂÂĐÊÔƠƯ\u1ea0-\u1ef9]/);
    await page.locator('#shop-tabs').getByRole('button',{name:'Season Wheel',exact:true}).click();
    await expect(page.locator('#shop-content h3').last()).toHaveText('The Magnetic & Quantum Era');
    await page.locator('#shop-tabs').getByRole('button',{name:'Inventory',exact:true}).click();
    const redCard=page.locator('.shop-card').filter({has:page.getByRole('heading',{name:'Original',exact:true})});
    await redCard.getByLabel('Skin name',{exact:true}).fill('Aster');
    await redCard.getByRole('button',{name:'Rename · 500 CB',exact:true}).click();
    await expect(page.locator('#shop-confirmation')).toContainText('500 CB');assert.equal(nameRequests.length,0);
    await page.locator('#shop-confirmation').getByRole('button',{name:'Cancel',exact:true}).click();assert.equal(nameRequests.length,0);
    await redCard.getByRole('button',{name:'Rename · 500 CB',exact:true}).click();
    await page.locator('#shop-confirmation').getByRole('button',{name:'Confirm',exact:true}).click();
    await expect(page.locator('.shop-card h3').filter({hasText:'Aster'})).toHaveCount(1);assert.equal(nameRequests.length,1);
    await page.setViewportSize({width:390,height:844});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  }finally{await browser?.close();if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}rmSync(dir,{recursive:true,force:true});}
});


test('PCB artwork follows physical stickers through turns, queue clearing and snapshot reset',{timeout:60000},async()=>{
  const {createServer:createViteServer}=await import('vite');
  let vite,browser;
  try{
    vite=await createViteServer({configFile:false,root:resolve('.'),publicDir:resolve('apps/web/public'),
      server:{host:'127.0.0.1',port:0},plugins:[{name:'artwork-regression-page',configureServer(server){
        server.middlewares.use((req,res,next)=>{
          if(req.url!=='/')return next();
          res.setHeader('Content-Type','text/html');
          res.end('<!doctype html><div id="cube" style="width:600px;height:500px"></div>');
        });
      }}]});
    await vite.listen();const base='http://127.0.0.1:'+vite.httpServer.address().port;
    browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
    const page=await browser.newPage();await page.goto(base);
    await page.evaluate(async()=>{
      const {CubeRenderer}=await import('/packages/renderer/src/cube-renderer.ts');
      const engine=await import('/packages/engine/src/index.ts');
      const surface={stickers:{roughness:0.5,metalness:0,opacity:1,normalScale:0,replaceColor:true,
        tileAtlases:Array(6).fill('/assets/skins/epic_pcb_circuit_01/board_r.png')}};
      const renderer=new CubeRenderer(document.querySelector('#cube'),{surface});renderer.setInstant(true);
      window.artworkReview={renderer,engine,surface};
    });
    await page.waitForFunction(()=>window.artworkReview.renderer.stickers[9].material.map?.image?.width===768);
    const result=await page.evaluate(async()=>{
      const {renderer:r,engine,surface}=window.artworkReview;
      const from=9,to=engine.compileMove('R',3)[from],cube=new engine.Cube(3);
      const beforeCrop=r.stickers[from].material.map.offset.toArray();
      const originalUv=Array.from(r.stickers[from].geometry.getAttribute('uv').array);
      const turn=async move=>{cube.applyMove(move);r.enqueueMove(move,cube.state);await new Promise(resolve=>{r.onIdle=resolve;});};
      await turn('R');
      const afterCrop=r.stickers[to].material.map.offset.toArray();
      const uv=r.stickers[to].geometry.getAttribute('uv');
      const rotatedUv=[uv.getX(0),uv.getY(0)];
      await turn('R');await turn('R');await turn('R');
      const restoredUv=Array.from(r.stickers[from].geometry.getAttribute('uv').array);
      r.setState(engine.solvedState(3));
      cube.state=engine.solvedState(3);
      for(const move of ['R','U']){cube.applyMove(move);r.enqueueMove(move,cube.state);}
      r.clearQueue();
      const destination=engine.compileMove('U',3)[to];
      const clearedCrop=r.stickers[destination].material.map.offset.toArray();
      r.setSurface({...surface});
      const reappliedTile=r.artwork.tile(destination);
      r.setState(engine.solvedState(3));
      const resetUv=Array.from(r.stickers[from].geometry.getAttribute('uv').array);
      const pending=r.pendingMoveCount;
      r.setSurface();const released=r.artworkGeometries.length;
      for(const size of [2,4,6]){r.setSize(size);r.setState(engine.solvedState(size));}
      r.dispose();
      return {beforeCrop,afterCrop,originalUv,rotatedUv,restoredUv,clearedCrop,reappliedTile,resetUv,pending,released};
    });
    assert.deepEqual(result.afterCrop,result.beforeCrop);
    assert.ok(Math.abs(result.rotatedUv[0]-(1-result.originalUv[1]))<1e-6);
    assert.ok(Math.abs(result.rotatedUv[1]-result.originalUv[0])<1e-6);
    for(const uv of [result.restoredUv,result.resetUv])uv.forEach((value,i)=>assert.ok(Math.abs(value-result.originalUv[i])<1e-6));
    assert.deepEqual(result.clearedCrop,result.beforeCrop);
    assert.equal(result.reappliedTile,0);assert.equal(result.pending,0);assert.equal(result.released,0);
    const champion=await page.evaluate(async()=>{
      const {CubeRenderer}=await import('/packages/renderer/src/cube-renderer.ts');
      const {CubeController}=await import('/packages/controller/src/index.ts');
      const design=await import('/apps/web/src/champion-design.ts');
      const options=design.championRendererOptions(await design.loadChampionDesign(2),'borderless',2);
      const r=new CubeRenderer(document.querySelector('#cube'),options),c=new CubeController(r,2);
      await new Promise((resolve,reject)=>{const end=performance.now()+10000;const check=()=>{
        if(r.stickers.every(m=>m.material.map?.image?.width))resolve();
        else if(performance.now()>end)reject(Error('Champion texture timeout'));else setTimeout(check,20);
      };check();});
      const counts=[];
      for(let seed=0;seed<10;seed++){
        c.scramble('champion-browser-'+seed);
        const state=c.cube.state;
        counts.push([0,3].map(color=>r.stickers.filter((m,i)=>state[i]===color&&m.material.map.offset.x<.01&&m.material.map.offset.y>.49).length));
      }
      c.reset();const state=c.cube.state;
      counts.push([0,3].map(color=>r.stickers.filter((m,i)=>state[i]===color&&m.material.map.offset.x<.01&&m.material.map.offset.y>.49).length));
      c.dispose();return counts;
    });
    champion.forEach(count=>assert.deepEqual(count,[1,1],'each snapshot must show one signature and one logo'));

  }finally{await browser?.close();await vite?.close();}
});
