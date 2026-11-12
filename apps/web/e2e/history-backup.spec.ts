import {expect,test} from '@playwright/test';
test('history survives reload, JSON roundtrips without duplicates and CSV downloads',async({page})=>{
 await page.clock.install();await page.goto('/');await expect(page.locator('#history-storage-status')).toContainText('Đã tải');
 await page.locator('#scramble').click();await page.locator('#timer-start').click();await page.clock.runFor(17100);
 const row=page.locator('#solve-history li');await expect(row).toHaveCount(1);await row.getByRole('button',{name:'+2',exact:true}).click();
 await expect(page.locator('#history-storage-status')).toContainText('Đã lưu');
 // Observe the durable transaction rather than reloading before an asynchronous write finishes.
 await expect.poll(()=>page.evaluate(()=>new Promise(resolve=>{const r=indexedDB.open('rubik-history-v1',1);r.onsuccess=()=>{const db=r.result,tx=db.transaction('history','readonly'),q=tx.objectStore('history').get('backup');tx.oncomplete=()=>{resolve(q.result?.backup.entries[0]?.penaltyOverride);db.close();};};}))).toBe('+2');
 const downloaded=page.waitForEvent('download');await page.locator('#history-export').click();const fs=await import('node:fs/promises'),json=await fs.readFile((await (await downloaded).path())!,'utf8');
 await page.reload();await expect(row).toHaveCount(1);await expect(row).toContainText('đã chỉnh');
 await page.locator('#history-import').setInputFiles({name:'backup.json',mimeType:'application/json',buffer:Buffer.from(json)});await expect(page.locator('#history-message')).toContainText('Đã nhập 0');await expect(row).toHaveCount(1);
 await page.locator('#history-import').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{bad')});await expect(page.locator('#history-message')).toContainText('không hợp lệ');await expect(row).toHaveCount(1);
 const csvPromise=page.waitForEvent('download');await page.locator('#history-csv').click();expect((await csvPromise).suggestedFilename()).toBe('rubik-history.csv');
});
test('blocked IndexedDB keeps timer usable and backup controls available',async({page})=>{
 await page.addInitScript(()=>Object.defineProperty(window,'indexedDB',{get(){throw new Error('blocked');}}));await page.clock.install();await page.goto('/');await expect(page.locator('#history-storage-status')).toContainText('Không đọc');
 await page.locator('#scramble').click();await page.locator('#timer-start').click();await page.clock.runFor(17100);await expect(page.locator('#solve-history li')).toHaveCount(1);await expect(page.locator('#history-export')).toBeEnabled();
});

test('another tab cannot silently overwrite a newer durable history',async({context})=>{
 const a=await context.newPage(),b=await context.newPage();
 for(const p of [a,b]){await p.goto('/');await expect(p.locator('#history-storage-status')).toContainText('Đã tải');}
 const file=(id:string)=>({name:'backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({version:1,entries:[{solve:{schemaVersion:1,id,size:3,seed:'s',scrambleIndex:0,scrambleSource:'generated',genVersion:1,engineVersion:'0.1.0',preEvents:[],events:[],inspectionMs:17001,timeMs:0,penalty:'DNF',startedAt:'2026-11-13T00:00:00.000Z'},penaltyOverride:null}]}))});
 await a.bringToFront();await a.locator('#history-import').setInputFiles(file('first'));await expect(a.locator('#history-storage-status')).toContainText('Đã lưu');
 await b.bringToFront();await b.locator('#history-import').setInputFiles(file('second'));await expect(b.locator('#history-storage-status')).toContainText('Không lưu');
 await b.reload();await expect(b.locator('#solve-history li')).toHaveCount(1);await expect(b.locator('#solve-history li')).toHaveAttribute('data-solve-id','first');
});
