import {expect,test} from '@playwright/test';

test('weekly board loads on demand and switches week/size safely on mobile',async({page})=>{
  const requests:string[]=[];
  await page.route('**/api/weekly-leaderboard?*',async route=>{
    const url=new URL(route.request().url());requests.push(url.search);
    await route.fulfill({json:{weekStart:'2026-11-09',weekEnd:'2026-11-15',closed:url.searchParams.get('week')==='previous',
      rows:url.searchParams.get('size')==='10'?[]:[{rank:1,name:'<b>Player</b>',timeMs:12345,rewardZn:url.searchParams.get('week')==='previous'?5:null}]}});
  });
  await page.goto('/?lang=en');
  await expect(page.locator('#weekly-size option')).toHaveCount(9);
  expect(requests).toHaveLength(0);
  await page.locator('#weekly-board summary').click();
  await expect(page.locator('#weekly-rows')).toContainText('<b>Player</b>');
  await expect(page.locator('#weekly-rows b')).toHaveCount(0);
  await expect(page.locator('#weekly-rows')).toContainText('12.34');
  await expect(page.locator('#weekly-rows')).toContainText('—');
  await page.selectOption('#weekly-period','previous');
  await expect(page.locator('#weekly-rows')).toContainText('5 ZN');
  expect(requests.at(-1)).toContain('week=previous');
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:'test-results/weekly-mobile.png',fullPage:true});
  await page.selectOption('#weekly-size','10');
  await expect(page.locator('#weekly-rows tr')).toHaveCount(0);
  await expect(page.locator('#weekly-status')).toHaveText('No results yet.');
});
