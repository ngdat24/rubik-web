import {expect,test} from '@playwright/test';

test('old Champion bookmarks open the matching inventory and preserve language',async({page})=>{
  // No test traffic is allowed to reach a real Auth/database endpoint.
  await page.route(/^https:\/\//,route=>route.abort());
  await page.route('**/api/**',route=>route.fulfill({json:{awards:[]}}));
  for(const size of [3,2]){
    await page.goto(`/champion.html?lang=en&size=${size}`);
    await expect(page).toHaveURL(new RegExp(`\\?inventory=${size}&lang=en$`));
    await expect(page.locator('html')).toHaveAttribute('lang','en');
    await expect(page.locator('#viewport canvas')).toBeVisible();
    await expect(page.locator('#shop-dialog')).toBeVisible();
    await expect(page.locator('#shop-tabs').getByRole('button',{name:'Inventory',exact:true})).toHaveAttribute('aria-pressed','true');
    await expect(page.locator('#stage,#preview-size,#variant-name,#claim')).toHaveCount(0);
    await expect(page.locator('#shop-content a[href*="champion.html"]')).toHaveCount(0);
  }
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
