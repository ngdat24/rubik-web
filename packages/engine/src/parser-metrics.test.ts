import { loadVectors } from './test-vectors.js';
import { describe, it, expect } from 'vitest';
import { MoveParseError, parseMoves, parseMove } from './parser.js';
import { countPressMoves, countSolutionLength } from './metrics.js';

const vectors = loadVectors();

it('includes all reference fixture groups', () => {
  for (const group of ['meta', 'parse', 'apply', 'metrics', 'stats', 'predicates', 'score', 'prng', 'scramble']) {
    expect(vectors).toHaveProperty(group);
  }
});

describe('spec parser vectors', () => {
  for (const tc of vectors.parse.valid) {
    it(`${tc.input} on ${tc.size}`, () => {
        expect(parseMoves(tc.input, tc.size).map(m => m.canonical)).toEqual(tc.canonical);
    });
  }
  for (const tc of vectors.parse.invalid) {
    it(`rejects ${tc.input} on ${tc.size}`, () => {
        expect(() => parseMoves(tc.input, tc.size)).toThrowError(MoveParseError);
        expect(() => parseMoves(tc.input, tc.size)).toThrowError(expect.objectContaining({ code: tc.errorCode, token: tc.badToken }));
    });
  }
});

describe('spec metrics vectors', () => {
  for (const tc of vectors.metrics) {
    it(tc.moves, () => {
      const moves = parseMoves(tc.moves, tc.size);
      expect(countPressMoves(moves, tc.size)).toBe(tc.pressCount);
      expect(countSolutionLength(moves, tc.size)).toBe(tc.solutionLength);
    });
  }
});

it('maps opposite faces, wide moves and rotations for sizes 2..10', () => {
  for (let size = 2; size <= 10; size++) {
    for (const [positive, negative, axis] of [['R', 'L', 'x'], ['U', 'D', 'y'], ['F', 'B', 'z']]) {
      expect(parseMove(positive!, size)).toMatchObject({ axis, layerStart: 1, layerEnd: 1, quarterTurns: -1 });
      expect(parseMove(negative!, size)).toMatchObject({ axis, layerStart: size, layerEnd: size, quarterTurns: 1 });
      expect(parseMove(axis!, size)).toMatchObject({ axis, layerStart: 1, layerEnd: size, quarterTurns: -1 });
      if (size > 2) {
        expect(parseMove(`${size - 1}${negative}w'`, size)).toMatchObject({ axis, layerStart: 2, layerEnd: size, quarterTurns: -1 });
        expect(countSolutionLength([`${size}${negative}`, positive!], size)).toBe(0);
      }
    }
  }
});

it('handles whitespace, invalid sizes and malformed suffixes', () => {
  expect(parseMoves('  R\n U\t')).toHaveLength(2);
  expect(parseMoves('  ')).toEqual([]);
  for (const size of [NaN, 1, 11, 2.5]) {
    expect(() => parseMoves('', size)).toThrow();
  }
  for (const token of ["R''", 'R22', 'R3', 'xw', '2M', '0R']) {
    expect(() => parseMove(token)).toThrow();
  }
});

it('reduces nested cancellations but preserves rotation barriers', () => {
  expect(countSolutionLength(['R', 'U', "U'", "R'"])).toBe(0);
  expect(countSolutionLength(['R', 'x', "x'", "R'"])).toBe(2);
  expect(countSolutionLength(['M', '2R'])).toBe(0);
  expect(countSolutionLength(['R', 'R', 'R', 'R'])).toBe(0);
});
