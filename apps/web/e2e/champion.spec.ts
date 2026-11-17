import {expect,test} from '@playwright/test';

test('Champion translates dynamic preview and keeps language across sizes and Practice',async({page})=>{
  // No test traffic is allowed to reach a real Auth/database endpoint.
  await page.route(/^https:\/\//,route=>route.abort());
  await page.route('**/api/**',route=>route.fulfill({json:{awards:[]}}));
  await page.goto('/champion.html?lang=en&size=3');
  await expect(page.locator('#stage canvas')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang','en');
  await expect(page.locator('#variant-name')).toHaveText('Borderless');
  await page.getByRole('button',{name:'View the magnets',exact:true}).click();
  await expect(page.locator('#core')).toHaveText('Close the top layer');
  await page.locator('#core').click();
  await page.getByRole('button',{name:'Black border',exact:true}).click();
  await expect(page.locator('#variant-name')).toHaveText('Black border');
  await expect(page.locator('#practice-link')).toHaveAttribute('href',/lang=en/);
  await page.selectOption('#preview-size','2');
  await expect(page).toHaveURL(/lang=en/);
  await expect(page.locator('#stage canvas')).toBeVisible();
  await expect(page.locator('#variant-copy')).toContainText('white corner tile');
  const text=(await page.locator('body').innerText()).replaceAll('ĐS','');
  expect(text).not.toMatch(/[ăâđêôơưĂÂĐÊÔƠƯ\u1ea0-\u1ef9]/);
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
