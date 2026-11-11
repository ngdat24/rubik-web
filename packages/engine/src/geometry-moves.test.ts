import { describe, expect, it } from 'vitest';
import { stickerGeometry, stickerIndex, NORMALS } from './geometry.js';
import { applyMove, applyMoveInPlace, applyMoves, applyPermutationInto, compileMove, invert } from './moves.js';
import { solvedState, toString } from './state.js';
import { simplify, countSolutionLength, countPressMoves, tps } from './metrics.js';
import { mulberry32 } from './prng.js';
import { loadVectors } from './test-vectors.js';

describe('sticker geometry', () => {
  for (let size = 2; size <= 10; size++) {
    it(`is a bijection and has the correct surface cubies for ${size}`, () => {
      const cubies = new Set<string>();
      for (let index = 0; index < 6 * size * size; index++) {
        const g = stickerGeometry(index, size);
        expect(stickerIndex(g.cubie, g.normal, size)).toBe(index);
        cubies.add(g.cubie.join(','));
      }
      expect(cubies.size).toBe(size ** 3 - (size - 2) ** 3);
    });
  }

  it('matches all top, bottom, left, right face adjacencies in 01', () => {
    const adjacent = [[5,2,4,1], [0,3,2,5], [0,3,4,1], [2,5,4,1], [0,3,5,2], [0,3,1,4]];
    for (let face = 0; face < 6; face++) {
      for (const [edge, [r, c]] of [[0,1],[2,1],[1,0],[1,2]].entries()) {
        const cubie = stickerGeometry(face * 9 + r! * 3 + c!, 3).cubie;
        const neighbor = adjacent[face]![edge]!;
        const n = NORMALS[neighbor]!;
        expect(cubie.reduce((sum, v, axis) => sum + v * n[axis]!, 0)).toBe(2);
      }
    }
  });

  it('rejects invalid geometry inputs', () => {
    expect(() => stickerGeometry(-1, 3)).toThrow();
    expect(() => stickerGeometry(54, 3)).toThrow();
    expect(() => stickerIndex([0,0,0], [0,1,0], 3)).toThrow();
    expect(() => stickerIndex([0,2,0], [1,1,0], 3)).toThrow();
  });
});

describe('reference move states', () => {
  for (const vector of loadVectors().apply) {
    it(`${vector.size}: ${vector.moves}`, () => {
      const initial = solvedState(vector.size);
      expect(toString(applyMoves(initial, vector.moves, vector.size))).toBe(vector.state);
      expect(initial).toEqual(solvedState(vector.size));
    });
  }
});

describe('permutations and inverses for every supported layer', () => {
  for (let size = 2; size <= 10; size++) {
    it(`inverses, fourth powers, seeded sequence for ${size}`, () => {
      const tokens = [...'URFDLBxyz'];
      if (size === 3) tokens.push('M','E','S');
      for (const face of 'URFDLB') {
        if (size > 2) for (let layer = 2; layer <= size; layer++) tokens.push(`${layer}${face}`);
        for (let width = 2; width < size; width++) tokens.push(`${width}${face}w`);
      }
      // Distinct labels catch permutation errors hidden by uniform sticker colors.
      const labels = Uint8Array.from({length: 6 * size * size}, (_, i) => i % 251);
      for (const token of tokens) for (const suffix of ['', "'", '2']) {
        const move = token + suffix;
        const p = compileMove(move, size);
        expect(new Set(p).size).toBe(p.length);
        expect(applyMoves(labels, [move, ...invert([move], size)], size)).toEqual(labels);
        expect(applyMoves(labels, Array(4).fill(move), size)).toEqual(labels);
      }
      const rng = mulberry32(size);
      const sequence = Array.from({length: 200}, () => tokens[rng() % tokens.length]! + ['', "'", '2'][rng() % 3]);
      expect(applyMoves(labels, [...sequence, ...invert(sequence, size)], size)).toEqual(labels);
    });
  }
});

it('satisfies known 3x3 identities', () => {
  const state = solvedState(3);
  for (const [left, right] of [['M', "Rw' R"], ['x', "R M' L'"], ['y', "U E' D'"], ['z', "F S B'"], ['Rw', "R M'"]]) {
    expect(applyMoves(state, left!, 3)).toEqual(applyMoves(state, right!, 3));
  }
  expect(applyMoves(state, "R U R' U' ".repeat(6), 3)).toEqual(state);
  expect(applyMoves(state, 'R U '.repeat(105), 3)).toEqual(state);
});

it('protects cached permutations and supports preallocated output and in-place cycles', () => {
  const state = solvedState(3), output = new Uint8Array(54), p = compileMove('R', 3);
  expect(applyPermutationInto(state, p, output)).toBe(output);
  expect(output).toEqual(applyMove(state, 'R', 3));
  expect(applyMoveInPlace(state, 'R', 3)).toBe(state);
  expect(state).toEqual(output);
  p.fill(0);
  expect(new Set(compileMove('R', 3)).size).toBe(54);
  expect(() => applyPermutationInto(state, p, state)).toThrow();
  expect(() => applyMoveInPlace(new Uint8Array(24), 'R', 3)).toThrow();
});

it('simplifies without changing state or solution length', () => {
  for (const vector of loadVectors().metrics) {
    const moves = vector.moves.split(/\s+/).filter(Boolean);
    const reduced = simplify(moves, vector.size);
    expect(countSolutionLength(reduced, vector.size)).toBe(vector.solutionLength);
    expect(countPressMoves(reduced, vector.size)).toBe(vector.solutionLength);
    expect(applyMoves(solvedState(vector.size), reduced, vector.size)).toEqual(applyMoves(solvedState(vector.size), moves, vector.size));
  }
  expect(tps(10, 2000)).toBe(5);
  expect(tps(0, 0)).toBe(0);
  expect(() => tps(1, -1)).toThrow();
});
