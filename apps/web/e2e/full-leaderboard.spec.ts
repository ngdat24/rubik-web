import {test,expect} from '@playwright/test';
test('extended board keeps available ranks, switches sizes and handles errors',async({page})=>{
 let failed=false,empty=false;
 await page.route('**/api/leaderboard?**',async route=>{
  const url=new URL(route.request().url());expect(url.searchParams.get('limit')).toBe('1000');
  if(failed){await route.fulfill({status:503,body:'unavailable'});return;}
  const count=empty?0:url.searchParams.get('size')==='3'?23:1000;
  await route.fulfill({json:{rows:Array.from({length:count},(_,i)=>({name:i===0?'<img src=x onerror=alert(1)>':'Player '+i,timeMs:1000+i,nameplate:'gold'}))}});
 });
 await page.goto('/leaderboard.html?lang=vi');
 await expect(page.locator('#board-rows tr')).toHaveCount(23);
 await expect(page.locator('#board-rows tr').last().locator('td').first()).toHaveText('23');
 await expect(page.locator('#board-rows img')).toHaveCount(0);
 await page.getByRole('button',{name:'2×2',exact:true}).click();
 await expect(page.locator('#board-rows tr')).toHaveCount(1000);
 await expect(page.locator('#board-rows tr').last().locator('td').first()).toHaveText('1000');
 await page.setViewportSize({width:390,height:844});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 failed=true;await page.getByRole('button',{name:'Làm mới',exact:true}).click();
 await expect(page.getByRole('status')).toContainText('Không tải được');
 await expect(page.locator('#board-rows tr')).toHaveCount(1000);
 failed=false;empty=true;await page.getByRole('button',{name:'Làm mới',exact:true}).click();
 await expect(page.locator('#board-rows tr')).toHaveCount(0);
 await expect(page.getByRole('status')).toContainText('Chưa có lượt giải hợp lệ.');
 empty=false;await page.goto('/leaderboard.html?lang=en');
 await expect(page.getByRole('heading',{level:1})).toHaveText('Leaderboard');
 await expect(page.getByRole('button',{name:'Refresh',exact:true})).toBeVisible();
});
