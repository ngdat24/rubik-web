import { expect, it } from 'vitest';
import { Cube } from '@rubik/engine';
import vectors from '../../../docs/spec/vectors.json' with { type: 'json' };
import { stateToColors, WESTERN_COLORS } from '../src/colors.js';
import type { ColorTheme } from '../src/colors.js';

it('maps engine results to the reference sticker colors', () => {
  for (const vector of vectors.apply) {
    const cube = new Cube(vector.size).applyMoves(vector.moves);
    const expected = Uint32Array.from(vector.state, digit => WESTERN_COLORS[Number(digit)]!);
    expect(stateToColors(cube.state)).toEqual(expected);
  }
});

it('supports alternative palettes without modifying the input state', () => {
  const state = new Cube().state, before = state.slice();
  const theme: ColorTheme = [0, 1, 2, 3, 4, 5];
  expect(stateToColors(state, theme)).toEqual(Uint32Array.from(state));
  expect(state).toEqual(before);
});

it('rejects malformed display buffers or palettes', () => {
  expect(() => stateToColors(new Uint8Array(53))).toThrow();
  const invalid = new Cube().state;
  invalid[53] = 255;
  expect(() => stateToColors(invalid)).toThrow();
  expect(() => stateToColors(new Cube().state, [0,1,2,3,4,0x1000000])).toThrow();
  expect(() => stateToColors(new Cube().state, [0,1,2,3,4,NaN])).toThrow();
});
