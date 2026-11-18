import {describe,expect,it} from 'vitest';
import {SolvedUnification} from '../src/prometheus-unification.js';

describe('solved ornament display',()=>{
  it('fades over two seconds without restarting on further unsolved inputs',()=>{
    const display=new SolvedUnification();
    display.setSolved(false,100);display.update(1100);expect(display.amount.value).toBeCloseTo(.5);
    display.setSolved(false,1200);display.update(2100);expect(display.amount.value).toBe(0);
    expect(display.wave.value).toBe(-1);
  });
  it('waits for final animation, reveals through the bloom, then stays raised',()=>{
    const display=new SolvedUnification();display.setSolved(false,0);display.update(2000);
    display.setSolved(true,2100);display.update(2200);expect(display.amount.value).toBe(0);
    display.reveal(2300);display.update(2950);expect(display.amount.value).toBeCloseTo(.5);expect(display.wave.value).toBeCloseTo(.5);
    display.update(3600);expect(display.amount.value).toBe(1);display.update(10000);expect(display.amount.value).toBe(1);
  });
  it('does not reveal a scrambled demo and reset cancels an active transition',()=>{
    const display=new SolvedUnification();display.setSolved(false,0);display.update(2000);display.reveal(2100);
    expect(display.amount.value).toBe(0);
    display.setSolved(true,2200,true);expect(display.amount.value).toBe(1);display.update(10000);expect(display.amount.value).toBe(1);
  });
  it('preserves already raised decoration when previewing the bloom',()=>{
    const display=new SolvedUnification();display.reveal(0);
    expect(display.amount.value).toBe(1);expect(display.floor.value).toBe(1);
    display.update(650);expect(display.amount.value).toBe(1);
  });
});
