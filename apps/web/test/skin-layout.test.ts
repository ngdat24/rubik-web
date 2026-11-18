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
});
