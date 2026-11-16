import {expect,test} from '@playwright/test';

const vietnamese = /[ăâđêôơưĂÂĐÊÔƠƯ\u1ea0-\u1ef9]/;
test('language selection translates static and dynamic UI and persists across pages',async({page})=>{
  await page.goto('/');
  await page.locator('.language-menu summary').click();
  await page.getByRole('button',{name:'English',exact:true}).click();
  await expect(page.locator('html')).toHaveAttribute('lang','en');
  await expect(page.locator('#timer-start')).toHaveText('Prepare scramble');
  await expect(page.locator('#key-settings-open')).toContainText('Key settings');
  await page.screenshot({path:'test-results/language-desktop.png',fullPage:true});
  await page.locator('#key-settings-open').click();
  await expect(page.locator('#key-settings')).toBeVisible();
  expect(await page.locator('#key-settings').innerText()).not.toMatch(vietnamese);
  await page.locator('#key-settings-close').click();
  await page.locator('#timer-start').click();
  await expect(page.locator('#timer-phase')).toContainText('Ready');
  await page.locator('#reset').click();
  await expect(page.locator('#cube-description')).toContainText('Solved');
  for(const path of ['/race.html','/time-limit.html']){
    await page.goto(path);
    await expect(page.locator('html')).toHaveAttribute('lang','en');
    expect(await page.locator('body').innerText()).not.toMatch(vietnamese);
    await expect(page.locator('title')).not.toContainText(vietnamese);
    await page.setViewportSize({width:390,height:844});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.setViewportSize({width:1280,height:900});
  }
  await page.goto('/');
  await page.setViewportSize({width:390,height:844});
  await page.locator('.language-menu summary').click();
  await expect(page.getByRole('button',{name:'English',exact:true})).toBeInViewport();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:'test-results/language-mobile.png',fullPage:true});
  await page.getByRole('button',{name:'Tiếng Việt',exact:true}).click();
  await expect(page.locator('html')).toHaveAttribute('lang','vi');
  await expect(page.locator('.language-menu summary')).toHaveText('Ngôn ngữ');
});

test('language URL fallback works with browser storage blocked',async({page})=>{
  await page.addInitScript(()=>{Object.defineProperty(window,'localStorage',{get(){throw new Error('blocked');}});});
  await page.goto('/');
  await page.locator('.language-menu summary').click();
  await page.getByRole('button',{name:'English',exact:true}).click();
  await expect(page.locator('html')).toHaveAttribute('lang','en');
  await expect(page.locator('#timer-start')).toHaveText('Prepare scramble');
});
