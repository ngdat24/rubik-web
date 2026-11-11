import { expect, test } from '@playwright/test';

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
  await page.locator('#algorithm').fill("R U R' U'");
  await page.locator('#algorithm-form button').click();
  await expect(page.locator('#queue-status')).toContainText('0 nước');
  await page.locator('#algorithm').fill('R invalid'); await page.locator('#algorithm-form button').click();
  await expect(page.locator('#algorithm-error')).not.toBeEmpty();
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
  const x = rect!.x + rect!.width / 2, y = rect!.y + rect!.height / 2;
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

test('physical keyboard controls follow spec 06 and leave editing and browser shortcuts alone', async ({page}) => {
  await page.goto('/');
  await expect(page.locator('canvas')).toBeVisible();
  for (const size of ['3', '7']) {
    await page.selectOption('#cube-size', size);
    await page.locator('#instant').check();
    await page.locator('#viewport').click({position:{x:5,y:5}});
    await page.keyboard.press('i');
    await expect(page.locator('#move-status')).toContainText('R');
    await expect(page.locator('#cube-description')).toContainText('Đang luyện tập');
    await page.keyboard.press('k');
    await expect(page.locator('#cube-description')).toContainText('đã giải');
    await page.keyboard.press('i'); await page.keyboard.press('i');
    await page.locator('#algorithm').fill('R2'); await page.locator('#algorithm-form button').click();
    await expect(page.locator('#cube-description')).toContainText('đã giải');
  }
  const status = await page.locator('#move-status').textContent();
  await page.locator('#algorithm').focus(); await page.keyboard.type('ijk');
  await expect(page.locator('#move-status')).toHaveText(status!);
  await page.evaluate(() => {
    const editable = document.createElement('div'); editable.contentEditable='true'; editable.id='editable';
    const child = document.createElement('span'); child.textContent='text'; editable.append(child); document.body.append(editable); editable.focus();
    child.dispatchEvent(new KeyboardEvent('keydown', {code:'KeyI', bubbles:true}));
  });
  await expect(page.locator('#move-status')).toHaveText(status!);
  await page.locator('#viewport').click({position:{x:5,y:5}});
  const prevented = await page.evaluate(() => {
    const flags = [
      {code:'KeyI',repeat:true},{code:'KeyI',isComposing:true},{code:'KeyI',ctrlKey:true},
      {code:'KeyI',altKey:true},{code:'KeyI',metaKey:true},{code:'Tab'}, {code:'Escape'}, {code:'KeyZ'}
    ];
    return flags.map(init => {const e=new KeyboardEvent('keydown',{...init,bubbles:true,cancelable:true}); window.dispatchEvent(e); return e.defaultPrevented;});
  });
  expect(prevented).toEqual(Array(8).fill(false));
  await expect(page.locator('#move-status')).toHaveText(status!);
  expect(await page.evaluate(() => {
    const e=new KeyboardEvent('keydown',{code:'Space',bubbles:true,cancelable:true}); window.dispatchEvent(e); return e.defaultPrevented;
  })).toBe(true);
  await page.evaluate(() => {const dialog=document.createElement('dialog');dialog.textContent='settings';document.body.append(dialog);dialog.showModal();});
  await page.keyboard.press('i');
  await expect(page.locator('#move-status')).toHaveText(status!);
});
