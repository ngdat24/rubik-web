import {expect,test} from '@playwright/test';
import type {Page} from '@playwright/test';

async function expireInspection(page:Page) {
  const start=page.locator('#timer-start');
  await start.click();
  await expect(page.locator('#timer-phase')).toContainText('Sẵn sàng');
  await start.click();
  await expect(page.locator('#timer-phase')).toContainText('Inspection');
  await page.clock.fastForward(18000);
  await expect(page.locator('#timer-readout')).toHaveText('DNF');
}

test('shows the five newest solves and preserves older history after reload',async({page})=>{
  await page.clock.install();
  await page.goto('/');
  await expect(page.locator('#history-storage-status')).toContainText('Đã tải');
  const rows=page.locator('#solve-history li');
  const ids:string[]=[];
  for(let i=0;i<6;i++){
    await expireInspection(page);
    await expect(rows).toHaveCount(Math.min(i+1,5));
    const id=(await rows.first().getAttribute('data-solve-id'))!;
    expect(ids).not.toContain(id);
    ids.unshift(id);
  }
  await expect(page.locator('#history-storage-status')).toContainText('Đã lưu');
  await page.reload();
  await expect(rows).toHaveCount(5);
  expect(await rows.evaluateAll(items=>items.map(item=>item.getAttribute('data-solve-id')))).toEqual(ids.slice(0,5));
  await rows.first().getByRole('button',{name:'Xóa',exact:true}).click();
  await expect(rows.last()).toHaveAttribute('data-solve-id',ids[5]!);
});

test('blocked IndexedDB keeps the timer and recent history usable',async({page})=>{
  await page.addInitScript(()=>Object.defineProperty(window,'indexedDB',{get(){throw new Error('blocked');}}));
  await page.clock.install();
  await page.goto('/');
  await expect(page.locator('#history-storage-status')).toContainText('Không đọc');
  await expireInspection(page);
  await expect(page.locator('#solve-history li')).toHaveCount(1);
});

test('a stale tab cannot overwrite newer durable history',async({context})=>{
  const a=await context.newPage(),b=await context.newPage();
  for(const page of [a,b]){
    await page.clock.install();
    await page.goto('/');
    await expect(page.locator('#history-storage-status')).toContainText('Đã tải');
  }
  await a.bringToFront();
  await expireInspection(a);
  await expect(a.locator('#history-storage-status')).toContainText('Đã lưu');
  const id=(await a.locator('#solve-history li').getAttribute('data-solve-id'))!;
  await b.bringToFront();
  await expireInspection(b);
  await expect(b.locator('#history-storage-status')).toContainText('Không lưu');
  await b.reload();
  await expect(b.locator('#solve-history li')).toHaveAttribute('data-solve-id',id);
});
