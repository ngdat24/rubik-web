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

test('Champion inventory: sizes, inline naming, preview and equip', {timeout:60000},async()=>{
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
    let awards=[{size:2,variant:null,name:null},{size:3,variant:'classic',name:'Champion cũ'}];const receipts=new Set();let renameRequests=[],failRename=true;
    const db=fakeDatabase();const id='11111111-1111-4111-8111-111111111111';db.profiles.set(id,{id,name:'Fixture Player'});
    const handler=createCloudHandler({env:{SUPABASE_URL:'https://db.test',SUPABASE_ANON_KEY:'public-test',SUPABASE_SERVICE_ROLE_KEY:'private-test'},
      fetcher:(url,options)=>db.fetcher(url,new URL(url).pathname==='/auth/v1/user'?{...options,headers:{...options.headers,Authorization:'Bearer anonymous-a'}}:options)});
    server=createServer(async(req,res)=>{
      if(req.url.startsWith('/api/champion')){
        if(req.method==='POST'){let text='';for await(const chunk of req)text+=chunk;const body=JSON.parse(text);
          if(body.action==='rename'){renameRequests.push(body);if(!receipts.has(body.requestId)){state.cb-=500;awards=awards.map(a=>a.size===body.size?{...a,name:body.name}:a);receipts.add(body.requestId);}
            if(failRename){failRename=false;res.writeHead(503,{'Content-Type':'application/json'});return res.end(JSON.stringify({error:'Không tải được quyền nhận Champion.'}));}
          }else {assert.equal(body.variant,'borderless');awards=awards.map(a=>a.size===body.size?{...a,variant:'borderless',name:body.name}:a);}
        }res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({awards}));
      }
      if(req.url.startsWith('/api/shop')){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify(state));}
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
    const openInventory=async()=>{
      await page.locator('#shop-open').click();
      await page.locator('#shop-tabs').getByRole('button',{name:'Kho skin',exact:true}).click();
    };
    const errors=[],resources=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>resources.push(r.url()));
    let releaseQuests;
    const questGate=new Promise(resolve=>{releaseQuests=resolve;});
    await page.route('**/api/quests',async route=>{
      await questGate;
      await route.fulfill({json:{completed:0,counts:[1,2,0,0],onlineSeconds:30}});
    });
    await page.goto(base+'/?lang=vi&diagnostics');await expect(page.locator('#player-label')).toHaveText('Fixture Player');
    try{
      await page.locator('#quest-panel summary').click();
      await expect(page.locator('#quest-bar-2')).toBeVisible();
      await expect(page.locator('#quest-status')).toBeVisible();
    }finally{
      releaseQuests();
    }
    await expect(page.locator('#quest-count-2')).toHaveText('(1/8)');
    await page.locator('#quest-panel summary').click();
    let releaseShopRead;
    const shopReadGate=new Promise(resolve=>{releaseShopRead=resolve;});
    await page.route('**/api/shop',async route=>{
      await shopReadGate;
      await route.continue();
    },{times:1});
    const shopRead=page.waitForRequest(request=>new URL(request.url()).pathname==='/api/shop'&&request.method()==='GET');
    try{
      await openInventory();
      await shopRead;
      await expect(page.locator('#shop-tabs').getByRole('button',{name:'Kho skin',exact:true})).toHaveAttribute('aria-pressed','true');
    }finally{
      releaseShopRead();
    }
    const card3=page.locator('[data-champion="3"]');
    await expect(card3).toHaveAttribute('data-tier','gold');
    const normalSkin=page.locator('#shop-content .shop-card').filter({hasText:state.inventory[0].skin.name}).first();
    let releaseEquip;
    const equipGate=new Promise(resolve=>{releaseEquip=resolve;});
    await page.route('**/api/shop',async route=>{
      if(route.request().method()!=='POST')return route.fallback();
      await equipGate;
      await route.fulfill({json:{...state,inventory:state.inventory.map((item,index)=>({...item,equipped:index===0}))}});
    });
    try{
      await normalSkin.getByRole('button',{name:'Trang bị',exact:true}).click();
      await expect(normalSkin.getByRole('button',{name:'Đang lưu trang bị…'})).toBeDisabled();
    }finally{
      releaseEquip();
    }
    await expect(normalSkin.getByText('Đang trang bị',{exact:true})).toBeVisible();
    await page.unroute('**/api/shop');
    await expect(page.locator('#shop-content a[href*="champion"]')).toHaveCount(0);
    await page.evaluate(()=>window.originalCanvas=document.querySelector('#viewport canvas'));
    await card3.getByRole('button',{name:'Trang bị',exact:true}).click();
    await expect(card3.getByRole('button',{name:'Đang trang bị',exact:true})).toBeVisible();
    assert.equal(await page.evaluate(()=>originalCanvas===document.querySelector('#viewport canvas')),true);
    await expect(page.locator('#viewport .champion-frame')).toHaveCount(1);
    await page.getByRole('button',{name:'Skin 2×2',exact:true}).click();
    const card2=page.locator('[data-champion="2"]');
    await expect(page.locator('.shop-card')).toHaveCount(1);
    await card2.getByLabel('Tên skin').fill('Kiếm vàng');
    await card2.getByRole('button',{name:'Đặt tên & nhận',exact:true}).click();
    await card2.getByRole('button',{name:'Xác nhận',exact:true}).click();
    await expect(card2.locator('.champion-skin-name')).toHaveText('Kiếm vàng');
    await card2.getByRole('button',{name:'Trang bị',exact:true}).click();
    await expect(card2.getByRole('button',{name:'Đang trang bị',exact:true})).toBeVisible();
    await card2.getByRole('button',{name:'Thử trên khối 3D',exact:true}).click();
    await expect(page.locator('#shop-preview-cube canvas')).toBeVisible();
    assert.equal(new URL(page.url()).pathname,'/');
    await page.locator('#shop-preview-close').click();
    await expect(page.locator('#shop-preview-cube canvas')).toHaveCount(0);
    await card2.getByLabel('Tên skin').fill('Kiếm bạc');
    await card2.getByRole('button',{name:'Đổi tên · 500 CB',exact:true}).click();
    await card2.getByRole('button',{name:'Xác nhận',exact:true}).click();
    await expect(card2.getByRole('button',{name:'Thử lại giao dịch',exact:true})).toBeVisible();
    await card2.getByRole('button',{name:'Thử lại giao dịch',exact:true}).click();
    await expect(card2.locator('.champion-skin-name')).toHaveText('Kiếm bạc');
    assert.equal(renameRequests.length,2);assert.equal(renameRequests[0].requestId,renameRequests[1].requestId);assert.equal(state.cb,9500);
    await page.locator('#shop-close').click();await page.selectOption('#cube-size','2');
    await expect(page.locator('#viewport .champion-frame__title')).toContainText('Kiếm bạc');
    await page.reload();await expect(page.locator('#viewport .champion-frame')).toHaveCount(1);
    await openInventory();await page.getByRole('button',{name:'Skin 2×2',exact:true}).click();
    await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    if(process.env.CHAMPION_CAPTURE)await page.screenshot({path:'.env.backups/champion-inventory-mobile.png'});
    await page.setViewportSize({width:1280,height:900});if(process.env.CHAMPION_CAPTURE)await page.screenshot({path:'.env.backups/champion-inventory-desktop.png'});
    awards=awards.filter(a=>a.size===2);
    await page.reload();await openInventory();
    await expect(page.locator('[data-champion="3"]')).toHaveCount(0);
    await expect(page.locator('#viewport .champion-frame')).toHaveCount(0);
    await page.goto(base+'/champion.html?size=2&lang=en');
    await page.waitForURL(base+'/?inventory=2&lang=en');
    await expect(page.locator('[data-champion="2"]')).toBeVisible();
    await expect(page.getByRole('button',{name:'Rename · 500 CB',exact:true})).toBeVisible();
    awards=[{size:2,variant:null,name:null}];await page.reload();
    await page.locator('[data-champion="2"]').getByRole('button',{name:'Equip',exact:true}).click();
    await expect(page.locator('.champion-skin-name')).toHaveText('Champion 2×2');
    awards=[];await page.reload();await expect(page.locator('[data-champion]')).toHaveCount(0);
    assert.equal(resources.some(url=>/\/classic_/.test(url)),false);
    assert.deepEqual(errors,[]);
  }finally{await browser?.close();if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}rmSync(dir,{recursive:true,force:true});}
});


