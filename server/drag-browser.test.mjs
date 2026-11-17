import test from 'node:test';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {chromium} from 'playwright';
test('mouse free orbit and right drag cancellation',{timeout:60000},async()=>{
 const {createServer:createViteServer}=await import('vite');let vite,browser;try{
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
      const {CubeRenderer}=await import('/packages/renderer/src/index.ts');
      const {CubeController}=await import('/packages/controller/src/index.ts');
      const {attachDrag}=await import('/apps/web/src/drag.ts');
      const renderer=new CubeRenderer(document.querySelector('#cube'));renderer.setInstant(true);
      const controller=new CubeController(renderer);attachDrag(renderer,controller,()=>{});
      window.review={renderer,controller,moves:[]};controller.onMoveApplied(e=>window.review.moves.push(e.move));
    });
    const target=await page.evaluate(()=>window.review.renderer.getPickTargets()[0]);
    const box=await page.locator('canvas').boundingBox();
    await page.mouse.move(target.x,target.y);await page.mouse.down();
    await page.mouse.move(target.x,target.y+box.height/2,{steps:30});await page.mouse.up();
    assert.equal(await page.evaluate(()=>window.review.moves.length),0);
    assert.ok(await page.evaluate(()=>window.review.renderer.camera.up.y<0));
    await page.evaluate(()=>window.review.renderer.resetCamera());
    assert.equal(await page.evaluate(()=>window.review.renderer.camera.up.y),1);
    const pick=await page.evaluate(()=>window.review.renderer.getPickTargets().find(p=>p.index>=18&&p.index<27));
    assert.ok(pick);
    await page.mouse.move(pick.x,pick.y);await page.mouse.down({button:'right'});
    await page.mouse.move(box.x+box.width+30,pick.y,{steps:12});
    await page.mouse.move(pick.x,pick.y);await page.mouse.up({button:'right'});
    assert.equal(await page.evaluate(()=>window.review.moves.length),0);
    assert.equal(await page.evaluate(()=>window.review.controller.inputEnabled),true);
    await page.mouse.move(pick.x,pick.y);await page.mouse.down({button:'right'});
    await page.mouse.move(pick.x+110,pick.y,{steps:12});await page.mouse.up({button:'right'});
    await page.waitForFunction(()=>window.review.moves.length===1);
    assert.ok(await page.evaluate(()=>!window.review.moves[0].endsWith('2')));
  }finally{await browser?.close();await vite?.close();}
});
