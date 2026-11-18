import {expect,it} from 'vitest';
import {bloomAmount,bloomTiming} from '../src/prometheus-bloom.js';

it('starts closed, holds wide and ends exactly closed after 3.6 seconds',()=>{
  expect(bloomAmount(-1)).toBe(0);expect(bloomAmount(0)).toBe(0);
  expect(bloomAmount(bloomTiming.openEnd)).toBe(1);expect(bloomAmount(1800)).toBe(1);
  expect(bloomAmount(bloomTiming.duration)).toBe(0);expect(bloomAmount(5000)).toBe(0);
});
it('opens and closes monotonically without overshooting or changing direction',()=>{
  let previous=0;
  for(let t=0;t<=bloomTiming.openEnd;t+=10){const amount=bloomAmount(t);expect(amount).toBeGreaterThanOrEqual(previous);expect(amount).toBeLessThanOrEqual(1);previous=amount;}
  previous=1;
  for(let t=bloomTiming.closeStart;t<=bloomTiming.duration;t+=10){const amount=bloomAmount(t);expect(amount).toBeLessThanOrEqual(previous);expect(amount).toBeGreaterThanOrEqual(0);previous=amount;}
});
