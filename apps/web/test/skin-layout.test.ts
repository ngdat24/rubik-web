import {describe,it,expect} from 'vitest';
import {skinLayout} from '../src/skin-effects.js';
describe('skin layout compatibility',()=>{
 it('leaves existing skin and default cube geometry unchanged',()=>{
  expect(skinLayout()).toEqual({});expect(skinLayout({})).toEqual({});
 });
 it('distinguishes borderless and framed catalog skins',()=>{
  expect(skinLayout({geometry:{borderless:true}})).toMatchObject({stickerInsetRatio:0});
  expect(skinLayout({geometry:{borderless:false}}).stickerInsetRatio).toBeGreaterThan(0);
 });
 it('keeps material geometry choices distinct when switching between rare skins',()=>{
  expect(skinLayout({geometry:{borderless:false,sticker_shape:'stone'}})).toMatchObject({stickerShape:'stone'});
  expect(skinLayout({geometry:{borderless:false,sticker_shape:'hexagon'}})).toMatchObject({stickerShape:'hexagon'});
  expect(skinLayout({geometry:{borderless:true,sticker_corner_ratio:.2}})).toMatchObject({stickerCornerRatio:.2,stickerInsetRatio:0});
 });
});
