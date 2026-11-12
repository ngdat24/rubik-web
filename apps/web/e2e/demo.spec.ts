import {expect,test} from '@playwright/test';

test('custom keymaps handle conflict cancel/swap, persist, import/export and retain defaults', async ({page}) => {
  await page.goto('/'); await expect(page.locator('canvas')).toBeVisible();
  await page.locator('#instant').check(); await page.locator('#key-settings-open').click();
  const rRow=page.locator('.key-row[data-move="R"]');
  await rRow.getByRole('button',{name:'Gán phím',exact:true}).click();
  await page.keyboard.press('u');
  await expect(page.locator('#key-conflict')).toBeVisible();
  await page.locator('#key-cancel').click();
  await expect(page.locator('#key-profile')).toHaveValue('default');
  await expect(rRow).toContainText('KeyR');
  await rRow.getByRole('button',{name:'Gán phím',exact:true}).click(); await page.keyboard.press('u');
  await page.selectOption('#key-replace','KeyR'); await page.locator('#key-swap').click();
  await expect(page.locator('#key-profile')).not.toHaveValue('default');
  await expect(rRow).toContainText('KeyU');
  await expect(page.locator('.key-row[data-move="U"]')).toContainText('KeyR');
  await page.locator('#key-profile-name').fill('backup'); await page.locator('#key-profile-form button').click();
  await expect(page.locator('#key-profile')).toHaveValue('backup');
  await rRow.getByRole('button',{name:'Gán phím',exact:true}).click(); await page.keyboard.press('a');
  await rRow.getByRole('button',{name:'Gán phím',exact:true}).click(); await page.keyboard.press('b');
  await expect(page.locator('#key-conflict-message')).toContainText('hai phím');
  await page.selectOption('#key-replace','KeyA'); await page.locator('#key-reassign').click();
  await expect(rRow).toContainText('KeyB'); await expect(rRow).not.toContainText('KeyA');
  await rRow.getByRole('button',{name:'Gỡ KeyB',exact:true}).click();
  await expect(rRow).not.toContainText('KeyB');
  await page.locator('#key-settings-close').click();
  await page.locator('#scramble').click(); await page.locator('#timer-start').click(); await page.locator('#viewport').click({position:{x:5,y:5}}); await page.keyboard.press('u');
  await expect(page.locator('#move-status')).toContainText('R');
  await expect(page.locator('#cube-description')).toContainText('Đang luyện tập');
  await page.reload(); await expect(page.locator('canvas')).toBeVisible();
  await page.locator('#key-settings-open').click(); await expect(page.locator('#key-profile')).toHaveValue('backup');
  await expect(rRow).toContainText('KeyU');
  await page.locator('#key-import').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{invalid')});
  await expect(page.locator('#key-settings-message')).toContainText('JSON không hợp lệ');
  await expect(page.locator('#key-profile')).toHaveValue('backup');
  const downloadPromise=page.waitForEvent('download'); await page.locator('#key-export').click();
  const download=await downloadPromise;
  const fs=await import('node:fs/promises'); const exported=await fs.readFile((await download.path())!,'utf8');
  expect(JSON.parse(exported).profiles.backup.bindings.KeyU).toBe('R');
  await page.selectOption('#key-profile','default'); await expect(rRow).toContainText('KeyR');
  await page.locator('#key-import').setInputFiles({name:'valid.json',mimeType:'application/json',buffer:Buffer.from(exported)});
  await expect(page.locator('#key-profile')).toHaveValue('backup');
  await page.locator('#key-reset').click(); await expect(rRow).toContainText('KeyR');
  await expect(page.locator('#key-profile')).toHaveValue('backup');
});

test('blocked storage does not prevent in-session key configuration', async ({page}) => {
  await page.addInitScript(()=>Object.defineProperty(window,'localStorage',{get:()=>{throw new Error('Blocked');}}));
  await page.goto('/'); await expect(page.locator('canvas')).toBeVisible();
  await expect(page.locator('#key-storage-status')).not.toBeEmpty();
  await page.locator('#key-settings-open').click();
  const row=page.locator('.key-row[data-move="R"]');
  await row.getByRole('button',{name:'Gán phím',exact:true}).click(); await page.keyboard.press('a');
  await expect(row).toContainText('KeyA');
  await expect(page.locator('#key-storage-status')).toContainText('phiên này');
  await page.locator('#key-settings-close').click();
  await page.locator('#scramble').click(); await page.locator('#timer-start').click(); await page.locator('#viewport').click({position:{x:5,y:5}}); await page.keyboard.press('a');
  await expect(page.locator('#move-status')).toContainText('R');
});


test('timer flow, focused Space, rotations, solved result and next scramble stays idle',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/?diagnostics=1');await expect(page.locator('canvas')).toBeVisible();
 await page.locator('#instant').check();await page.locator('#timer-start').click();await expect(page.locator('#timer-phase')).toContainText('Sẵn sàng');
 await page.keyboard.press('r');await expect(page.locator('#timer-phase')).toContainText('Sẵn sàng');
 await page.locator('#seed').fill('timer-e2e');await page.locator('#scramble').click();const scramble=(await page.locator('#scramble-text').textContent())!.trim().split(/\s+/);
 await page.locator('#reset').focus();await page.keyboard.press('Space');await expect(page.locator('#timer-phase')).toContainText('Inspection');
 await expect(page.locator('#scramble-text')).not.toContainText('Chưa có');
 await expect(page.locator('#key-settings-open')).toBeDisabled();await expect(page.locator('#algorithm')).toBeDisabled();
 await page.keyboard.press('x');await expect(page.locator('#timer-phase')).toContainText('Inspection');await page.keyboard.press('Shift+x');
 for(const move of scramble.reverse()){
  const face=move[0]!.toLowerCase();await page.keyboard.press(move.endsWith('2')?'Alt+'+face:move.endsWith("'")?face:'Shift+'+face);
 }
 await expect(page.locator('#timer-phase')).toContainText('kết thúc');await expect(page.locator('#timer-readout')).not.toHaveText('DNF');
 await expect(page.locator('#key-settings-open')).toBeEnabled();
 await page.keyboard.press('Space');await expect(page.locator('#timer-phase')).toContainText('Sẵn sàng');
 await expect(page.locator('#seed')).not.toHaveValue('timer-e2e');expect(errors).toEqual([]);
});

test('cancel restores the same scramble, timeout continues behind the dialog, touch Start works',async({page})=>{
 await page.clock.install();await page.goto('/');await expect(page.locator('canvas')).toBeVisible();
 await page.locator('#seed').fill('cancel-seed');await page.locator('#scramble').click();const original=await page.locator('#scramble-text').textContent();
 await page.locator('#timer-start').click();await page.keyboard.press('r');await expect(page.locator('#timer-phase')).toContainText('Đang giải');
 await page.keyboard.press('Escape');await expect(page.locator('#timer-cancel-dialog')).toBeVisible();
 await page.locator('#timer-confirm-cancel').click();await expect(page.locator('#timer-phase')).toContainText('Sẵn sàng');await expect(page.locator('#scramble-text')).toHaveText(original!);
 await page.locator('#timer-start').click();await page.locator('#timer-cancel').click();
 await page.clock.runFor(17100);await expect(page.locator('#timer-readout')).toHaveText('DNF');
 await page.locator('#timer-confirm-cancel').click();await expect(page.locator('#timer-phase')).toContainText('kết thúc');
});

test('drag cannot start while idle; during inspection it starts the solve, context recovery preserves locks',async({page})=>{
 await page.goto('/?diagnostics=1');await expect(page.locator('canvas')).toBeVisible();await page.selectOption('#cube-size','7');
 await page.locator('#scramble').click();await page.locator('canvas').scrollIntoViewIfNeeded();
 const target=await page.evaluate(()=>(window as any).rubikDiagnostics(true).pickTargets.find((p:any)=>Math.floor(p.index/49)===2));
 const drag=async()=>{await page.locator('canvas').scrollIntoViewIfNeeded();const target=await page.evaluate(()=>(window as any).rubikDiagnostics(true).pickTargets.find((p:any)=>Math.floor(p.index/49)===2));await page.mouse.move(target.x,target.y);await page.mouse.down();await page.mouse.move(target.x+120,target.y,{steps:10});await page.mouse.up();};
 await drag();await expect(page.locator('#timer-phase')).toContainText('Sẵn sàng');
 await page.locator('#camera-reset').click();await page.locator('#timer-start').click();await drag();await expect(page.locator('#timer-phase')).toContainText('Đang giải');
 await page.evaluate(()=>{const ext=document.querySelector('canvas')!.getContext('webgl2')!.getExtension('WEBGL_lose_context')!;(window as any).loss=ext;ext.loseContext();});
 await expect(page.locator('#context-message')).toBeVisible();await page.evaluate(()=>(window as any).loss.restoreContext());await expect(page.locator('#context-message')).toBeHidden();
 await expect(page.locator('#timer-phase')).toContainText('Đang giải');await page.locator('#timer-cancel').click();await page.locator('#timer-confirm-cancel').click();
 await expect(page.locator('#timer-phase')).toContainText('Sẵn sàng');
});

test('demo renders, runs moves, changes N/camera and frees old geometries', async ({page}) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => {if (m.type() === 'error') errors.push(m.text());});
  await page.goto('/?diagnostics=1');
  await expect(page.locator('canvas')).toBeVisible();
  const visiblePixel = () => page.evaluate(() => new Promise<number[]>(resolve => requestAnimationFrame(() => {
    const canvas = document.querySelector('canvas')!, gl = canvas.getContext('webgl2')!;
    const pixel = new Uint8Array(4);
    gl.readPixels(canvas.width / 2, canvas.height / 2, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
    resolve([...pixel]);
  })));
  expect((await visiblePixel())[3]).toBeGreaterThan(0);
  await page.locator('#camera-back').click();
  const camera = await page.evaluate(() => (window as any).rubikDiagnostics().camera as number[]);
  for (const [axis, value] of [-6,-5,-7].entries()) expect(camera[axis]).toBeCloseTo(value);
  await page.locator('#camera-reset').click();
  for (const size of ['2','3','4','5','6','7','8','9','10','2','10','2','10']) {
    await page.selectOption('#cube-size', size);
    await expect.poll(() => page.evaluate(() => (window as any).rubikDiagnostics().size)).toBe(Number(size));
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
    expect(await page.evaluate(() => (window as any).rubikDiagnostics().geometries)).toBe(2);
  }
  expect(await page.evaluate(() => (window as any).rubikDiagnostics().drawCalls)).toBe(2);
  // Warm all sizes first, then compare heap after two equal cycles with explicit browser GC.
  const memorySession = await page.context().newCDPSession(page);
  await memorySession.send('HeapProfiler.collectGarbage');
  const memoryBefore = await memorySession.send('Runtime.getHeapUsage');
  for (let i = 0; i < 12; i++) {await page.selectOption('#cube-size', i % 2 ? '10' : '2');}
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
  await memorySession.send('HeapProfiler.collectGarbage');
  const memoryAfter = await memorySession.send('Runtime.getHeapUsage');
  expect(memoryAfter.usedSize - memoryBefore.usedSize).toBeLessThan(8 * 1024 * 1024);
  expect(await page.evaluate(() => (window as any).rubikDiagnostics().geometries)).toBe(2);
  await page.locator('#algorithm').fill(''); await page.locator('#algorithm-form button').click();
  await page.screenshot({path: 'test-results/demo-10x10.png', fullPage: true});
  expect((await visiblePixel())[3]).toBeGreaterThan(0);
  await page.locator('#seed').fill('e2e'); await page.locator('#scramble').click();
  await expect(page.locator('#scramble-text')).not.toContainText('Chưa có');
  await page.locator('#reset').click();
  await expect(page.locator('#cube-description')).toContainText('đã giải');
  expect(errors).toEqual([]);
});

test('recovers after WebGL context loss and supports touch orbit', async ({browser}) => {
  const context = await browser.newContext({hasTouch: true, viewport: {width: 900, height: 900}});
  const page = await context.newPage();
  await page.goto('/?diagnostics=1'); await expect(page.locator('canvas')).toBeVisible();
  await page.selectOption('#cube-size', '10');
  await page.locator('canvas').scrollIntoViewIfNeeded();
  const rect = await page.locator('canvas').boundingBox();
  const cdp = await context.newCDPSession(page);
  const x = rect!.x + 12, y = rect!.y + 12;
  await cdp.send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: [{x,y,id:0}]});
  await cdp.send('Input.dispatchTouchEvent', {type: 'touchMove', touchPoints: [{x:x+80,y:y+30,id:0}]});
  await cdp.send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []});
  await expect.poll(() => page.evaluate(() => (window as any).rubikDiagnostics().camera[0])).not.toBe(6);
  await page.evaluate(() => {
    const extension = document.querySelector('canvas')!.getContext('webgl2')!.getExtension('WEBGL_lose_context')!;
    (window as any).testLossExtension = extension; extension.loseContext();
  });
  await expect(page.locator('#context-message')).toBeVisible();
  await page.evaluate(() => (window as any).testLossExtension.restoreContext());
  await expect(page.locator('#context-message')).toBeHidden();
  await expect.poll(() => page.evaluate(() => (window as any).rubikDiagnostics().contextLost)).toBe(false);
  const alpha = await page.evaluate(() => new Promise<number>(resolve => requestAnimationFrame(() => {
    const canvas = document.querySelector('canvas')!, gl = canvas.getContext('webgl2')!, pixel = new Uint8Array(4);
    gl.readPixels(canvas.width/2, canvas.height/2, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
    resolve(pixel[3]!);
  })));
  expect(alpha).toBeGreaterThan(0);
  await page.locator('#reset').click();
  await expect(page.locator('#cube-description')).toContainText('đã giải');
  await context.close();
});


test('touch Start enters inspection without a hardware keyboard',async({browser})=>{
 const context=await browser.newContext({hasTouch:true,viewport:{width:600,height:900}});const page=await context.newPage();
 await page.goto('/');await expect(page.locator('canvas')).toBeVisible();await page.locator('#scramble').tap();await page.locator('#timer-start').tap();
 await expect(page.locator('#timer-phase')).toContainText('Inspection');await expect(page.locator('#key-settings-open')).toBeDisabled();await context.close();
});

test('Space prepares then starts, Shift+Space regenerates; view keys are opt-in',async({page})=>{
 await page.goto('/');await expect(page.locator('canvas')).toBeVisible();await page.locator('#instant').check();
 await page.locator('#viewport').click({position:{x:5,y:5}});await page.keyboard.press('Space');
 await expect(page.locator('#timer-phase')).toContainText('Sẵn sàng');const first=await page.locator('#seed').inputValue();
 await page.keyboard.press('Shift+Space');await expect(page.locator('#seed')).not.toHaveValue(first);await expect(page.locator('#timer-phase')).toContainText('Sẵn sàng');
 await expect(page.locator('#view-keys')).not.toBeChecked();await page.locator('#view-keys').check();await page.locator('#camera-back').click();
 await expect(page.locator('#view-key-map')).toContainText('F → B');await expect(page.locator('#view-key-map')).toContainText('R → L');
 await page.locator('#viewport').click({position:{x:5,y:5}});await page.keyboard.press('Space');await expect(page.locator('#timer-phase')).toContainText('Inspection');
 await page.keyboard.press('r');await expect(page.locator('#move-status')).toContainText('L');await expect(page.locator('#timer-phase')).toContainText('Đang giải');
});

test('history adds each result once, preserves original penalties and recomputes per size',async({page})=>{
 await page.clock.install();await page.goto('/');await expect(page.locator('canvas')).toBeVisible();
 await page.locator('#scramble').click();await page.locator('#timer-start').click();await page.clock.runFor(17100);
 const row=page.locator('#solve-history li').first();await expect(page.locator('#solve-history li')).toHaveCount(1);
 await expect(row.locator('.solve-time')).toContainText('gốc DNF');await expect(page.locator('#solve-stats')).toContainText('single: -');
 await row.getByRole('button',{name:'Không phạt',exact:true}).click();await expect(row.locator('.solve-time')).toContainText('đã chỉnh');await expect(row.locator('.solve-time')).toContainText('gốc DNF');await expect(page.locator('#solve-stats')).toContainText('single: 0.00');
 await row.getByRole('button',{name:'+2',exact:true}).click();await expect(page.locator('#solve-stats')).toContainText('single: 2.00');
 await row.getByRole('button',{name:'Phạt gốc',exact:true}).click();await expect(page.locator('#solve-stats')).toContainText('single: -');
 await page.selectOption('#cube-size','7');await expect(page.locator('#solve-history li')).toHaveCount(0);await page.selectOption('#cube-size','3');await expect(page.locator('#solve-history li')).toHaveCount(1);
 await row.getByRole('button',{name:'Xóa',exact:true}).click();await expect(page.locator('#solve-history li')).toHaveCount(0);await expect(page.locator('#solve-stats')).toContainText('ao5: -');
});
