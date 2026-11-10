import { describe, it, expect } from 'vitest';
import { Cube } from './cube.js';

describe('Cube Core State', () => {
  it('initializes solved state for 3x3', () => {
    const cube = new Cube(3);
    expect(cube.state.length).toBe(54);
    expect(cube.isSolved()).toBe(true);
  });

  it('supports sizes from 2 to 10', () => {
    const cube2 = new Cube(2);
    expect(cube2.state.length).toBe(24);
    expect(cube2.isSolved()).toBe(true);

    const cube10 = new Cube(10);
    expect(cube10.state.length).toBe(600);
    expect(cube10.isSolved()).toBe(true);
  });

  it('detects unsolved state', () => {
    const cube = new Cube(3);
    cube.state[0] = 1;
    expect(cube.isSolved()).toBe(false);
  });
});
