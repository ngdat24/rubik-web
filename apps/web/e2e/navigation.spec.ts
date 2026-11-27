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
  await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 }
 await page.goto('/leaderboard.html?lang=en');await expect(page.locator('.site-navigation').getByRole('link',{name:'Main',exact:true})).toBeVisible();
 await page.screenshot({path:'test-results/navigation-mobile.png',fullPage:true});
 await page.setViewportSize({width:1440,height:900});await page.goto('/');await page.screenshot({path:'test-results/navigation-desktop.png',fullPage:true});
});

test('mobile navigation stays in two rows with wallet between logo and language and profile in the triangle',async({page})=>{
 await page.route(/^https:\/\//,r=>r.abort());
 await page.route('**/api/navigation-season',r=>r.fulfill({json:{endsAt:new Date(Date.now()+12*86400000).toISOString()}}));
 for(const lang of ['vi','en']){
  await page.setViewportSize({width:390,height:844});await page.goto('/?lang='+lang);
  const nav=page.locator('.site-navigation'),more=nav.locator('.nav-more-toggle'),profile=nav.locator('.profile-nav'),wallet=nav.locator('#economy-wallet');
  // Simulate a loaded account/wallet while keeping this layout test independent of Auth.
  await profile.locator('.nav-item').evaluate(node=>{
   (node as HTMLElement).hidden=false;node.addEventListener('click',()=>{(node as HTMLElement).dataset.clicked='true';});
  });
  await wallet.evaluate(node=>{(node as HTMLOutputElement).hidden=false;node.innerHTML='<span>300 CB</span><span>7 ZN</span>';});
  for(const width of [320,360,390,430,625,850]){
   await page.setViewportSize({width,height:844});
   const brand=(await nav.locator('.brand').boundingBox())!,language=(await nav.locator('.language-menu').boundingBox())!;
   expect(Math.abs(brand.y-language.y)).toBeLessThanOrEqual(1);
   const money=(await wallet.boundingBox())!;
   expect(money.x).toBeGreaterThanOrEqual(brand.x+brand.width-1);
   expect(money.x+money.width).toBeLessThanOrEqual(language.x+1);
   expect(money.y).toBeGreaterThanOrEqual(brand.y);
   expect(money.y+money.height).toBeLessThanOrEqual(brand.y+brand.height+1);
   const rows=await nav.locator('[data-nav=home],.nav-modes,.fashion-nav,[data-nav=board],.nav-more-toggle').evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().top));
   expect(Math.max(...rows)-Math.min(...rows)).toBeLessThanOrEqual(1);
   expect(rows[0]).toBeGreaterThanOrEqual(brand.y+brand.height-1);
   expect((await nav.boundingBox())!.height).toBeLessThanOrEqual(110);
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
   // Labels fit their cells; the bar must not hide clipped text to pass the overflow check.
   expect(await nav.locator('[data-nav=home],[data-nav=board],.fashion-nav>.nav-item,.nav-modes>summary').evaluateAll(nodes=>nodes.every(n=>n.scrollWidth<=n.clientWidth))).toBe(true);
  }
  await page.setViewportSize({width:390,height:844});
  await expect(profile).not.toBeVisible();await expect(wallet).toBeVisible();await more.click();await expect(profile).toBeVisible();await expect(wallet).toBeVisible();
  expect((await profile.boundingBox())!.x).toBeGreaterThanOrEqual(0);
  await page.keyboard.press('Escape');await expect(profile).not.toBeVisible();await expect(more).toBeFocused();
  await more.click();await page.locator('body').dispatchEvent('click');await expect(profile).not.toBeVisible();
  await more.click();await profile.locator('.nav-item').click();await expect(profile).not.toBeVisible();
  await expect(profile.locator('.nav-item')).toHaveAttribute('data-clicked','true');
  if(lang==='vi')await page.screenshot({path:'test-results/navigation-mobile-two-rows.png'});
  await page.setViewportSize({width:1440,height:900});await expect(more).not.toBeVisible();await expect(wallet).toBeVisible();
  await expect(nav.locator(':scope > #economy-wallet')).toHaveCount(1);
  expect((await nav.boundingBox())!.height).toBeLessThanOrEqual(66);
 }
});
