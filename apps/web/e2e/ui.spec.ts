import {expect,test} from '@playwright/test';
test('cube workspace is responsive, uncluttered and keeps cube larger than clock',async({page})=>{
 await page.goto('/');await expect(page.locator('canvas')).toBeVisible();
 await expect(page.locator('#workspace-tools')).not.toHaveAttribute('open','');
 await expect(page.getByLabel('Khóa xoay phím',{exact:true})).not.toBeChecked();
 await expect(page.locator('#speed')).toHaveValue('40');await expect(page.locator('#speed')).toHaveAttribute('min','30');await expect(page.locator('#speed')).toHaveAttribute('max','100');
 await expect(page.locator('#burst,#catch-up')).toHaveCount(0);await expect(page.locator('.timer-actions #scramble')).toHaveCount(1);
 await page.locator('#key-settings-open').click();
 const actions=(await page.locator('.key-file-actions').boundingBox())!,profiles=(await page.locator('#key-profile').boundingBox())!;
 expect(actions.y).toBeLessThan(profiles.y);await page.locator('#key-settings-close').click();
 const cube=(await page.locator('#viewport').boundingBox())!,clock=(await page.locator('.timer-panel').boundingBox())!;
 expect(cube.height).toBeGreaterThan(clock.height*2);expect(cube.y).toBeLessThan(clock.y);
 await page.screenshot({path:'test-results/workspace-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'test-results/workspace-mobile.png',fullPage:true});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
 const scene=(await page.locator('.solve-space').boundingBox())!,history=(await page.locator('.history-panel').boundingBox())!;
 expect(scene.y).toBeLessThan(history.y);await page.locator('#timer-start').click();await expect(page.locator('#timer-phase')).toContainText('Sẵn sàng');
});
