import { chromium } from '@playwright/test';
const browser = await chromium.launch({channel: process.env.PLAYWRIGHT_CHANNEL || undefined, args: ['--enable-webgl', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']});
try {
  const page = await browser.newPage({viewport: {width: 1280, height: 900}});
  await page.goto('http://127.0.0.1:4173/?diagnostics=1');
  await page.waitForSelector('canvas');
  await page.selectOption('#cube-size', '10');
  await page.waitForTimeout(300);
  const sample = () => page.evaluate(() => new Promise(resolve => {
    const intervals = [], cpu = [];
    let start, previous;
    function frame(time) {
      if (start === undefined) start = time;
      if (previous !== undefined) intervals.push(time - previous);
      previous = time;
      cpu.push(window.rubikDiagnostics().renderMs);
      if (time - start < 1500) requestAnimationFrame(frame);
      else resolve({fps: +(1000 / (intervals.reduce((a,b) => a+b, 0) / intervals.length)).toFixed(1),
        meanRenderMs: +(cpu.reduce((a,b) => a+b, 0) / cpu.length).toFixed(2), ...window.rubikDiagnostics()});
    }
    requestAnimationFrame(frame);
  }));
  const idle = await sample();
  await page.locator('#speed').fill('500');
  await page.locator('#algorithm').fill(Array.from({length: 300}, () => 'Rw U 3Fw').join(' '));
  await page.locator('#algorithm-form button').click();
  const moving = await sample();
  const gpu = await page.evaluate(() => {
    const gl = document.querySelector('canvas').getContext('webgl2');
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown';
  });
  console.log(JSON.stringify({gpu, idle, moving}, null, 2));
} finally {await browser.close();}
