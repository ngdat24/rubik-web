import {expect,test} from '@playwright/test';
test('cube workspace is responsive, uncluttered and keeps cube larger than clock',async({page})=>{
 await page.goto('/');await expect(page.locator('canvas')).toBeVisible();
 await expect(page.locator('#workspace-tools')).not.toHaveAttribute('open','');
 const cube=(await page.locator('#viewport').boundingBox())!,clock=(await page.locator('.timer-panel').boundingBox())!;
 expect(cube.height).toBeGreaterThan(clock.height*2);expect(cube.y).toBeLessThan(clock.y);
 await page.screenshot({path:'test-results/workspace-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'test-results/workspace-mobile.png',fullPage:true});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
 const scene=(await page.locator('.solve-space').boundingBox())!,history=(await page.locator('.history-panel').boundingBox())!;
 expect(scene.y).toBeLessThan(history.y);await page.locator('#timer-start').click();await expect(page.locator('#timer-phase')).toContainText('Sẵn sàng');
});
