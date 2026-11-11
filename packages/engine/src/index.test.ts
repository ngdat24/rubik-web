import { describe, it, expect } from 'vitest';
import * as engine from './index.js';

describe('engine setup', () => {
  it('supports a full scramble/replay round trip through the public API', () => {
    expect(engine.ENGINE_VERSION).toBe('0.1.0');
    const scramble = engine.scrambleAt('public-api', 3, 0);
    const cube = new engine.Cube().applyMoves(scramble);
    expect(cube.isSolved()).toBe(false);
    cube.applyMoves(engine.invert(scramble));
    expect(cube.isSolved()).toBe(true);
    expect(engine.Cube.fromString(cube.toString()).equals(cube)).toBe(true);
  });
});
