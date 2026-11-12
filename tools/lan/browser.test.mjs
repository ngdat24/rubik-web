import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRequire} from 'node:module';
import {createLanServer} from './server.mjs';
const require=createRequire(new URL('../../apps/web/package.json',import.meta.url));
const {chromium,expect}=require('@playwright/test');

test('two browsers share ranking, names survive reload, offline solves retry', {timeout:90000},async()=>{
  const dataDir=mkdtempSync(join(tmpdir(),'rubik-browser-'));
  const server=createLanServer({dataDir});await new Promise(r=>server.listen(0,'127.0.0.1',r));
  let browser;
  try{
    browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
    const context=await browser.newContext({viewport:{width:1440,height:1000}}),other=await browser.newContext();
    const a=await context.newPage(),b=await other.newPage();const base='http://127.0.0.1:'+server.address().port;
    const errors=[];a.on('pageerror',e=>errors.push(e.message));
    for(const [page,name] of [[a,'An'],[b,'Bình']]){
      await page.goto(base);await expect(page.locator('#player-dialog')).toBeVisible();await page.locator('#player-name').fill(name);await page.locator('#player-form button[type=submit]').click();await expect(page.locator('#player-dialog')).not.toBeVisible();
    }
    await a.locator('#workspace-tools summary').click();await a.locator('#instant').check();await a.locator('#view-keys').check();
    await a.selectOption('#cube-size','2');await a.locator('#scramble').click();const moves=(await a.locator('#scramble-text').textContent()).trim().split(/\s+/);
    await a.locator('#timer-start').click();
    await context.setOffline(true);
    for(const move of moves.reverse())await a.keyboard.press(move.endsWith('2')?'Alt+'+move[0].toLowerCase():move.endsWith("'")?move[0].toLowerCase():'Shift+'+move[0].toLowerCase());
    await expect(a.locator('#solve-history li')).toHaveCount(1);
    await expect.poll(()=>a.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('rubik.lan.pending.')).length)).toBe(1);
    await context.setOffline(false);await a.goto(base);
    await expect(a.locator('#player-label')).toHaveText('An');await expect(a.locator('#player-dialog')).not.toBeVisible();
    await a.selectOption('#leaderboard-size','2');await expect(a.locator('#leaderboard-rows')).toContainText('An');
    await b.selectOption('#leaderboard-size','2');await expect(b.locator('#leaderboard-rows')).toContainText('An');
    await expect.poll(()=>a.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('rubik.lan.pending.')).length)).toBe(0);
    const cube=await a.locator('.solve-space').boundingBox(),board=await a.locator('.leaderboard-panel').boundingBox();assert.ok(board.x>=cube.x+cube.width);
    await a.setViewportSize({width:390,height:844});assert.equal(await a.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    assert.deepEqual(errors,[]);await context.close();await other.close();
  }finally{await browser?.close();await new Promise(r=>{server.closeAllConnections();server.close(r);});rmSync(dataDir,{recursive:true,force:true});}
});
