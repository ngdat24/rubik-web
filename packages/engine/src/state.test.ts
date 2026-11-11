import { describe, expect, it } from 'vitest';
import { clone, equals, fromString, hash, solvedState, toString } from './state.js';
import { Cube } from './cube.js';
import { loadVectors } from './test-vectors.js';

describe('state for N = 2..10', () => {
  for (let size = 2; size <= 10; size++) {
    it(`creates and round trips ${size}x${size}`, () => {
      const state = solvedState(size);
      const text = '012345'.split('').map(color => color.repeat(size * size)).join('');
      expect(toString(state)).toBe(text);
      expect(state.length).toBe(6 * size * size);
      expect(equals(fromString(text), state)).toBe(true);
      const cube = Cube.fromString(text);
      expect(cube.size).toBe(size);
      expect(cube.isSolved()).toBe(true);
      expect(cube.equals(new Cube(size))).toBe(true);
    });
  }
});

it('round trips every reference apply state, including unsolved states', () => {
  for (const vector of loadVectors().apply) {
    const state = fromString(vector.state);
    expect(state.length).toBe(6 * vector.size ** 2);
    expect(toString(state)).toBe(vector.state);
    expect(Cube.fromString(vector.state).isSolved()).toBe(vector.solved);
  }
});

it('clones independently and compares bytes and lengths', () => {
  const state = solvedState(3);
  const copy = clone(state);
  expect(copy).not.toBe(state);
  expect(equals(copy, state)).toBe(true);
  copy[0] = 1;
  expect(state[0]).toBe(0);
  expect(equals(copy, state)).toBe(false);
  expect(equals(state, solvedState(2))).toBe(false);
  const cube = new Cube();
  const other = cube.clone();
  other.state[0] = 1;
  expect(cube.state[0]).toBe(0);
  expect(cube.equals(other)).toBe(false);
});

it('hashes deterministically using unsigned FNV-1a', () => {
  expect(hash(new Uint8Array())).toBe(0x811c9dc5);
  expect(hash(new Uint8Array([0]))).toBe(0x050c5d1f);
  const cube = new Cube();
  expect(cube.hash()).toBe(cube.clone().hash());
  expect(cube.hash()).toBe(hash(fromString(cube.toString())));
  expect(cube.hash()).toBeGreaterThanOrEqual(0);
  expect(cube.hash()).toBeLessThanOrEqual(0xffffffff);
});

it('rejects invalid sizes and malformed serialized states', () => {
  for (const size of [0, 1, 11, 2.5, NaN, Infinity]) {
    expect(() => solvedState(size)).toThrow(RangeError);
    expect(() => new Cube(size)).toThrow(RangeError);
  }
  for (const text of ['', '0'.repeat(54), '0'.repeat(53), '012345', '6' + new Cube().toString().slice(1), ' ' + new Cube().toString().slice(1)]) {
    expect(() => fromString(text)).toThrow(RangeError);
    expect(() => Cube.fromString(text)).toThrow(RangeError);
  }
  const invalid = solvedState(3);
  invalid[0] = 255;
  expect(() => toString(invalid)).toThrow(RangeError);
});
