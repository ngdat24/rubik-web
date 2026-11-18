import {expect,test} from '@playwright/test';
import type {Page} from '@playwright/test';

async function prepare(page:Page,size='3'){
 await page.goto('/?diagnostics=1');await expect(page.locator('canvas')).toBeVisible();await page.selectOption('#cube-size',size);
 await page.locator('#workspace-tools summary').click();await page.locator('#instant').check();
 await page.locator('#seed').fill('t4-'+size);await page.locator('#seed').press('Enter');
 return (await page.locator('#scramble-text').textContent())!.trim().split(/\s+/);
}

for(const size of ['2','3'])test(`completed ${size}x${size} run is saved once, auto-scrambles and rejects input until inspection`,async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 const moves=await prepare(page,size);await page.locator('#timer-start').focus();await page.keyboard.press('Space');
 await expect(page.locator('#timer-phase')).toContainText('Inspection');
 await page.keyboard.press('x');await page.keyboard.press('Shift+x');await expect(page.locator('#solve-history li')).toHaveCount(0);
 for(const move of moves.reverse())await page.keyboard.press(move.endsWith('2')?'Alt+'+move[0]!.toLowerCase():move.endsWith("'")?move[0]!.toLowerCase():'Shift+'+move[0]!.toLowerCase());
 await expect(page.locator('#timer-phase')).toContainText('Sẵn sàng');await expect(page.locator('#cube-description')).toContainText('Đã trộn');await expect(page.locator('#seed')).not.toHaveValue('t4-'+size);await expect(page.locator('#solve-history li')).toHaveCount(1);
 const result=await page.locator('#timer-readout').textContent();
 await page.keyboard.press('r');await page.keyboard.press('x');
 await page.locator('canvas').scrollIntoViewIfNeeded();
 const target=await page.evaluate((n)=>(window as any).rubikDiagnostics(true).pickTargets.find((p:any)=>Math.floor(p.index/(n*n))===2),Number(size));
 await page.mouse.move(target.x,target.y);await page.mouse.down();await page.mouse.move(target.x+90,target.y,{steps:8});await page.mouse.up();
 await expect(page.locator('#solve-history li')).toHaveCount(1);await expect(page.locator('#timer-readout')).toHaveText(result!);await expect(page.locator('#cube-description')).toContainText('Đã trộn');
 expect(await page.evaluate(()=>(window as any).rubikDiagnostics().pending)).toBe(0);expect(errors).toEqual([]);
 await page.keyboard.press('Space');await expect(page.locator('#timer-phase')).toContainText('Inspection');
});

test('cancel during inspection and solving saves nothing and focused Space does not click controls',async({page})=>{
 const moves=await prepare(page);const scramble=moves.join(' ');await page.locator('#reset').focus();await page.keyboard.press('Space');
 await expect(page.locator('#scramble-text')).toHaveText(scramble);
 for(const phase of ['inspection','solving']){
  if(phase==='solving'){await page.locator('#timer-start').click();await page.keyboard.press('r');}
  const before=await page.locator('#seed').inputValue();
  await page.keyboard.press('Escape');await expect(page.locator('#timer-cancel-dialog')).toBeVisible();
  await page.locator('#timer-keep').click();await expect(page.locator('#seed')).toHaveValue(before);
  await page.keyboard.press('Escape');await page.locator('#timer-confirm-cancel').click();
  await expect(page.locator('#timer-phase')).toContainText('Sẵn sàng');await expect(page.locator('#solve-history li')).toHaveCount(0);await expect(page.locator('#scramble-text')).not.toHaveText(scramble);await expect(page.locator('#seed')).not.toHaveValue(before);
 }
});

test('+2 result is saved before auto-scramble and Space starts the next inspection',async({page})=>{
 await page.clock.install();const moves=await prepare(page,'2');
 await page.locator('#timer-start').click();await page.clock.fastForward(16000);
 for(const move of moves.reverse())await page.keyboard.press(move.endsWith('2')?'Alt+'+move[0]!.toLowerCase():move.endsWith("'")?move[0]!.toLowerCase():'Shift+'+move[0]!.toLowerCase());
 await expect(page.locator('#solve-history li')).toHaveCount(1);await expect(page.locator('#solve-history li')).toContainText('gốc +2');
 await expect(page.locator('#timer-phase')).toContainText('Sẵn sàng');await expect(page.locator('#seed')).not.toHaveValue('t4-2');
 await expect(page.locator('#timer-readout')).toContainText('(+2)');
 await page.locator('#history-tools > summary').click();
 const exported=page.waitForEvent('download');await page.locator('#history-export').click();
 const fs=await import('node:fs/promises'),data=JSON.parse(await fs.readFile((await (await exported).path())!,'utf8'));
 expect(data.entries[0].solve.seed).toBe('t4-2');expect(data.entries[0].solve.penalty).toBe('+2');
 await page.keyboard.press('Space');await expect(page.locator('#timer-phase')).toContainText('Inspection');
});

test('fake browser clock advances DOM timestamps and late input cannot create a solve after DNF',async({page})=>{
 await page.clock.install();await prepare(page);
 const before=await page.evaluate(()=>new KeyboardEvent('keydown').timeStamp);await page.clock.runFor(1000);
 const after=await page.evaluate(()=>new KeyboardEvent('keydown').timeStamp);expect(after-before).toBeGreaterThanOrEqual(1000);
 const originalSeed=await page.locator('#seed').inputValue(),originalScramble=await page.locator('#scramble-text').textContent();
 await page.locator('#timer-start').click();await page.clock.fastForward(18000);
 await expect(page.locator('#timer-readout')).toHaveText('DNF');await page.keyboard.press('r');await page.keyboard.press('x');
 await expect(page.locator('#timer-phase')).toContainText('kết thúc');await expect(page.locator('#solve-history li')).toHaveCount(1);await expect(page.locator('#solve-history li')).toContainText('gốc DNF');
 await expect(page.locator('#seed')).toHaveValue(originalSeed);await expect(page.locator('#scramble-text')).toHaveText(originalScramble!);
 await page.keyboard.press('Space');await expect(page.locator('#seed')).not.toHaveValue(originalSeed);await expect(page.locator('#timer-phase')).toContainText('Sẵn sàng');
 await page.keyboard.press('Space');await expect(page.locator('#timer-phase')).toContainText('Inspection');
});

test('touch layer starts solving and touch Cancel restores idle without a history entry',async({browser})=>{
 const context=await browser.newContext({hasTouch:true,viewport:{width:390,height:844}}),page=await context.newPage();
 await page.goto('/?diagnostics=1');await expect(page.locator('canvas')).toBeVisible();await page.locator('#timer-start').tap();await page.locator('#timer-start').tap();await page.locator('canvas').scrollIntoViewIfNeeded();
 const {x,y}=await page.evaluate(()=>(window as any).rubikDiagnostics(true).pickTargets.find((p:any)=>p.index===22));
 const cdp=await context.newCDPSession(page);
 await cdp.send('Input.synthesizeScrollGesture',{x,y,xDistance:190,yDistance:0,speed:500,gestureSourceType:'touch'});
 await expect(page.locator('#timer-phase')).toContainText('Đang giải');await page.locator('#timer-cancel').tap({timeout:10000,noWaitAfter:true});await expect(page.locator('#timer-cancel-dialog')).toBeVisible();await page.locator('#timer-confirm-cancel').tap({timeout:10000,noWaitAfter:true});
 await expect(page.locator('#timer-phase')).toContainText('Sẵn sàng');await expect(page.locator('#solve-history li')).toHaveCount(0);await context.close();
});
