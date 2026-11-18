import {test,expect} from '@playwright/test';
test('shared navigation, mode toggle, season and responsive layout',async({page})=>{
 await page.route(/^https:\/\//,r=>r.abort());
 await page.route('**/api/navigation-season',r=>r.fulfill({json:{endsAt:new Date(Date.now()+3*86400000).toISOString()}}));
 await page.route('**/api/leaderboard?**',r=>r.fulfill({json:{rows:[]}}));
 for(const path of ['/','/leaderboard.html','/time-limit.html','/race.html']){
  await page.setViewportSize({width:1440,height:900});
  await page.goto(path);
  const nav=page.locator('.site-navigation');await expect(nav).toBeVisible();
  const bounds=(await nav.boundingBox())!;
  expect(bounds.width).toBeGreaterThan(1350);expect(bounds.height).toBeLessThanOrEqual(66);
  const badge=(await nav.locator('.nav-season').boundingBox())!;expect(badge.y).toBeGreaterThanOrEqual(bounds.y+bounds.height-1);
  expect(await nav.evaluate(el=>getComputedStyle(el,'::after').borderBottomLeftRadius)).toBe('18px');
  await expect(nav.locator('[data-nav=home]')).toHaveCSS('border-radius','0px');
  await expect(nav.locator('.nav-modes')).toHaveCSS('border-right-width','1px');
  await expect(nav.locator('[data-nav=board]')).toHaveCSS('border-right-width','1px');
  await expect(nav.getByText('Còn 3 ngày',{exact:true})).toBeVisible();
  const mode=nav.locator('.nav-modes');await mode.locator('summary').click();
  await expect(mode.getByRole('link',{name:'Time Limit',exact:true})).toBeVisible();
  await expect(mode.getByRole('link',{name:'Đấu 1v1',exact:true})).toHaveAttribute('href',/race.html/);
  await mode.locator('summary').click();await expect(mode).not.toHaveAttribute('open','');
  await mode.locator('summary').click();await page.keyboard.press('Escape');await expect(mode).not.toHaveAttribute('open','');
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 }
 await page.goto('/leaderboard.html?lang=en');await expect(page.locator('.site-navigation').getByRole('link',{name:'Main',exact:true})).toBeVisible();
 await page.screenshot({path:'test-results/navigation-mobile.png',fullPage:true});
 await page.setViewportSize({width:1440,height:900});await page.goto('/');await page.screenshot({path:'test-results/navigation-desktop.png',fullPage:true});
});
