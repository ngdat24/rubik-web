import test from 'node:test';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {chromium} from 'playwright';
test('upright mouse orbit and left drag cancellation',{timeout:60000},async()=>{
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
    await page.mouse.move(target.x,target.y);await page.mouse.down({button:'right'});
    await page.mouse.move(target.x,target.y+box.height/2,{steps:30});await page.mouse.up({button:'right'});
    assert.equal(await page.evaluate(()=>window.review.moves.length),0);
    assert.deepEqual(await page.evaluate(()=>window.review.renderer.camera.up.toArray()),[0,1,0]);
    assert.ok(await page.evaluate(()=>Math.abs(window.review.renderer.camera.position.y)<window.review.renderer.camera.position.length()));
    await page.mouse.move(target.x,target.y);await page.mouse.down({button:'right'});
    await page.mouse.move(target.x,target.y-box.height,{steps:30});await page.mouse.up({button:'right'});
    assert.deepEqual(await page.evaluate(()=>window.review.renderer.camera.up.toArray()),[0,1,0]);
    const before=await page.evaluate(()=>window.review.renderer.camera.position.toArray());
    await page.mouse.move(target.x,target.y);await page.mouse.down({button:'right'});
    await page.mouse.move(target.x+box.height,target.y,{steps:40});await page.mouse.up({button:'right'});
    const after=await page.evaluate(()=>window.review.renderer.camera.position.toArray());
    after.forEach((v,i)=>assert.ok(Math.abs(v-before[i])<1e-6));
    await page.evaluate(()=>window.review.renderer.resetCamera());
    assert.equal(await page.evaluate(()=>window.review.renderer.camera.up.y),1);
    const pick=await page.evaluate(()=>window.review.renderer.getPickTargets().find(p=>p.index>=18&&p.index<27));
    assert.ok(pick);
    await page.mouse.move(pick.x,pick.y);await page.mouse.down({button:'left'});
    await page.mouse.move(box.x+box.width+30,pick.y,{steps:12});
    await page.mouse.move(pick.x,pick.y);await page.mouse.up({button:'left'});
    assert.equal(await page.evaluate(()=>window.review.moves.length),0);
    assert.equal(await page.evaluate(()=>window.review.controller.inputEnabled),true);
    await page.mouse.move(pick.x,pick.y);await page.mouse.down({button:'left'});
    await page.mouse.move(pick.x+110,pick.y,{steps:12});await page.mouse.up({button:'left'});
    await page.waitForFunction(()=>window.review.moves.length===1);
    assert.ok(await page.evaluate(()=>!window.review.moves[0].endsWith('2')));
    // Pick actual plastic borders and the gap between adjacent cells, for both render paths.
    for(const size of [2,3,7]){
      const points=await page.evaluate(async size=>{
        const {buildLayout}=await import('/packages/renderer/src/layout.ts');
        const {renderer:r,controller:c}=window.review;c.setSize(size);r.resetCamera();
        const layout=buildLayout(size),a=layout.slots[2*size*size+Math.floor(size/2)*size],b=layout.slots[a.index+1];
        const project=position=>{
          const p=r.camera.position.clone().set(...position).project(r.camera),rect=r.canvas.getBoundingClientRect();
          return {x:rect.left+(p.x+1)*rect.width/2,y:rect.top+(1-p.y)*rect.height/2};
        };
        const gap=a.position.map((v,i)=>(v+b.position[i])/2);
        const border=a.position.map((v,i)=>v+(b.position[i]-v)*(layout.stickerSize/2+layout.cellSize*0.02)/layout.cellSize);
        return [border,gap].map(position=>{
          const p=project(position),hit=r.pick(p.x,p.y);
          return {...p,face:hit?.slot.face,index:hit?.slot.index,valid:[a.index,b.index].includes(hit?.slot.index)};
        });
      },size);
      for(const p of points){assert.equal(p.face,2);assert.equal(p.valid,true);}
      const gap=points[1],before=await page.evaluate(()=>window.review.moves.length);
      await page.mouse.move(gap.x,gap.y);await page.mouse.down({button:'left'});
      await page.mouse.move(gap.x+110,gap.y,{steps:12});await page.mouse.up({button:'left'});
      await page.waitForFunction(before=>window.review.moves.length===before+1,before);
    }
    assert.equal(await page.evaluate(()=>window.review.renderer.pick(0,0)),null);
  }finally{await browser?.close();await vite?.close();}
});
