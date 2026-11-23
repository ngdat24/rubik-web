import {test} from 'node:test';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {chromium} from 'playwright';

test('lightweight Prometheus follows a held drag, resumes the turn and keeps turn effects',{timeout:120000},async()=>{
  const {createServer}=await import('vite');let vite,browser;
  try{
    vite=await createServer({configFile:false,root:resolve('.'),publicDir:resolve('apps/web/public'),cacheDir:resolve('node_modules/.vite-prometheus-drag'),
      server:{host:'127.0.0.1',port:0},plugins:[{name:'prometheus-drag-fixture',configureServer(server){
        server.middlewares.use((req,res,next)=>{
          if(req.url!=='/')return next();res.setHeader('Content-Type','text/html');
          res.end('<!doctype html><div id="cube" style="width:600px;height:420px;position:relative"></div>');
        });
      }}]});
    await vite.listen();
    browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
    const page=await browser.newPage({viewport:{width:660,height:500}}),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.goto('http://127.0.0.1:'+vite.httpServer.address().port);
    await page.evaluate(async()=>{
      const {CubeRenderer}=await import('/packages/renderer/src/index.ts');
      const {CubeController}=await import('/packages/controller/src/index.ts');
      const {attachDrag}=await import('/apps/web/src/drag.ts');
      const {PrometheusStudy}=await import('/apps/web/src/prometheus-study.ts');
      const {mountPrometheus}=await import('/apps/web/src/prometheus-live.ts');
      const original=PrometheusStudy.prototype.setInteractionEffects;
      PrometheusStudy.prototype.setInteractionEffects=function(enabled){window.study=this;original.call(this,enabled);};
      const renderer=new CubeRenderer(document.querySelector('#cube'));renderer.setSpeed(200);
      const controller=new CubeController(renderer,3);window.lowFx=false;
      const live=mountPrometheus(document.querySelector('#cube'),renderer,controller,()=>window.lowFx);
      const off=attachDrag(renderer,controller,()=>{},undefined,{
        begin:move=>live.beginDrag(move),update:angle=>live.updateDrag(angle),end:()=>live.endDrag(),resume:angle=>live.resumeDrag(angle),
      });
      window.qa={renderer,controller,live,off,moves:[],turns:[],effects:[]};controller.onMoveApplied(event=>window.qa.moves.push(event.move));
      await window.study.ready;await live.prepareScramble('prometheus-drag-feedback');
      // Drive both renderers with identical frame timestamps, without GPU timing noise.
      const study=window.study,render=study.webgl.render;
      cancelAnimationFrame(study.frame);cancelAnimationFrame(renderer.frame);
      study.webgl.render=()=>{};study.soundEnabled(false);study.setInteractionEffects(false);
      const cases=[30,40,70,100].flatMap(ms=>['R','R2'].map(move=>({ms,moves:[move]})));
      cases.push({ms:40,moves:['R','U','F']},{ms:40,moves:['R','U'],change:'speed'},
        {ms:100,moves:['R'],change:'queue'},{ms:100,moves:['R','U'],change:'instant'});
      try{
        for(const scenario of cases){
          renderer.clearQueue();study.cancel();study.setState(controller.cube.state);
          renderer.setInstant(false);renderer.setSpeed(scenario.ms);
          for(const move of scenario.moves)controller.applyMove(move,performance.now());
          let previous=0,previousActive;
          for(let frame=0;frame<100;frame++){
            if(frame===3){
              if(scenario.change==='speed')renderer.setSpeed(100);
              if(scenario.change==='queue')controller.applyMove('B',performance.now());
              if(scenario.change==='instant')renderer.setInstant(true);
            }
            cancelAnimationFrame(renderer.frame);cancelAnimationFrame(study.frame);
            renderer.draw(10000+frame*5);study.draw(10000+frame*5);
            const normal=renderer.active?.progress??1,prometheus=study.active?.progress??1;
            if(Math.abs(normal-prometheus)>1e-8||renderer.pendingMoveCount!==study.queue.length+Number(Boolean(study.active)))
              throw Error('Prometheus timing differs from normal: '+JSON.stringify({scenario,frame,normal,prometheus}));
            if(scenario.change==='speed'&&study.active===previousActive&&prometheus<previous)throw Error('Changing speed rewound the turn');
            previous=prometheus;previousActive=study.active;
            if(!renderer.pendingMoveCount&&!study.isAnimating)break;
            if(frame===99)throw Error('Turn queue failed to complete');
          }
        }
        window.qa.timingCases=cases.length;
      }finally{
        cancelAnimationFrame(renderer.frame);cancelAnimationFrame(study.frame);
        study.webgl.render=render;renderer.frame=0;
        renderer.setInstant(false);renderer.setSpeed(200);
        controller.scramble('prometheus-drag-feedback');live.setQuality();
        study.frame=requestAnimationFrame(study.draw);window.qa.moves=[];
      }
      window.study.fx.clear();
      const start=window.study.startNextTurn.bind(window.study),turn=window.study.fx.turn;
      window.study.startNextTurn=now=>{const previous=window.study.active;start(now);if(window.study.active&&window.study.active!==previous)window.qa.turns.push({angle:window.study.active.angle,startAngle:window.study.active.startAngle});};
      window.study.fx.turn=(...args)=>{turn(...args);window.qa.effects.push(window.study.fx.turnActive);};
    });
    assert.equal(await page.evaluate(()=>window.qa.timingCases),12);
    assert.equal(await page.evaluate(()=>window.study.lightweight),true);
    const pick=()=>page.evaluate(()=>window.qa.renderer.getPickTargets().find(p=>p.index>=18&&p.index<27));
    const target=await pick();assert.ok(target);
    await page.mouse.move(target.x,target.y);await page.mouse.down();
    await page.mouse.move(target.x+35,target.y,{steps:3});
    const first=await page.evaluate(()=>({angle:window.study.pivot.quaternion.angleTo(window.study.root.quaternion),moves:window.qa.moves.length,drag:window.study.dragMove}));
    assert.ok(first.drag);assert.ok(first.angle>.05);assert.equal(first.moves,0);
    await page.mouse.move(target.x+145,target.y,{steps:5});
    assert.ok(await page.evaluate(()=>window.study.pivot.quaternion.angleTo(window.study.root.quaternion))>first.angle);
    await page.mouse.up();
    assert.equal(await page.evaluate(()=>window.qa.moves.length),1);
    await page.waitForFunction(()=>!window.study.isAnimating&&window.qa.renderer.pendingMoveCount===0);
    assert.ok(await page.evaluate(()=>Math.abs(window.qa.turns[0].startAngle))>.05);
    assert.equal(await page.evaluate(()=>window.qa.effects[0]),true);
    // Cancel a held drag: restore the exact visible transforms without applying an engine move.
    const before=await page.evaluate(()=>({state:[...window.qa.controller.cube.state],
      caps:window.study.caps.map(cap=>[...cap.position.toArray(),...cap.quaternion.toArray()])}));
    const next=await pick();assert.ok(next);
    await page.mouse.move(next.x,next.y);await page.mouse.down();await page.mouse.move(next.x+60,next.y,{steps:3});
    await page.evaluate(()=>window.dispatchEvent(new Event('blur')));await page.mouse.up();
    const after=await page.evaluate(()=>({state:[...window.qa.controller.cube.state],
      caps:window.study.caps.map(cap=>[...cap.position.toArray(),...cap.quaternion.toArray()]),
      dragging:Boolean(window.study.dragMove),locks:[...window.qa.controller.lockedBy]}));
    assert.deepEqual(after.state,before.state);assert.equal(after.dragging,false);assert.deepEqual(after.locks,[]);
    after.caps.forEach((cap,index)=>{
      for(let axis=0;axis<3;axis++)assert.ok(Math.abs(cap[axis]-before.caps[index][axis])<1e-7,
        JSON.stringify({index,axis,before:before.caps[index],after:cap}));
      // Quaternion q and -q encode the same physical orientation.
      const dot=cap.slice(3).reduce((sum,value,axis)=>sum+value*before.caps[index][axis+3],0);
      assert.ok(Math.abs(1-Math.abs(dot))<1e-7);
    });
    // A reverse half-turn must continue toward -PI from the released angle, not reverse to +PI.
    await page.evaluate(()=>{
      const {live,controller}=window.qa;live.beginDrag('U2');live.updateDrag(-2.4);live.endDrag();
      controller.applyMove('U2',performance.now());live.resumeDrag(-2.4);
    });
    await page.waitForFunction(()=>!window.study.isAnimating&&window.qa.renderer.pendingMoveCount===0);
    assert.equal(await page.evaluate(()=>window.qa.turns.at(-1).angle),-Math.PI);
    await page.evaluate(()=>{window.lowFx=true;window.qa.live.setQuality();window.study.fx.clear();window.qa.controller.applyMove('R',performance.now());});
    await page.waitForFunction(()=>!window.study.isAnimating&&window.qa.renderer.pendingMoveCount===0);
    assert.equal(await page.evaluate(()=>window.study.fx.turnActive),false);
    assert.deepEqual(errors,[]);
    await page.evaluate(()=>{window.qa.off();window.qa.live.dispose();window.qa.controller.dispose();});
  }finally{await browser?.close();await vite?.close();}
});
