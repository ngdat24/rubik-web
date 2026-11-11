import { expect, it } from 'vitest';
import { xmur3, mulberry32 } from './prng.js';
import { scrambleAt, scrambleCandidate, scrambleLength, matchScrambleAt } from './scramble.js';
import { parseMoves } from './parser.js';
import { applyMoves } from './moves.js';
import { solvedState } from './state.js';
import { f2lSolvedAny, isSolved } from './predicates.js';
import { FACE_NAMES } from './geometry.js';
import { loadVectors } from './test-vectors.js';

for (const vector of loadVectors().prng) {
  it(`matches PRNG integers and floats for ${vector.input}`, () => {
    const hash = xmur3(vector.input)();
    expect(hash).toBe(vector.hash32);
    const rng = mulberry32(hash), values = Array.from({length: 3}, () => rng());
    expect(values).toEqual(vector.u32);
    expect(values.map(v => v / 4294967296)).toEqual(vector.float);
  });
}

for (const vector of loadVectors().scramble) {
  it(`matches approved scramble ${vector.seed}/${vector.size}/${vector.k}`, () => {
    expect(scrambleAt(vector.seed, vector.size, vector.k, vector.genVersion)).toEqual(vector.scramble);
  });
}

it('generates deterministic valid scrambles obeying all axis rules for N=2..10', () => {
  for (let size = 2; size <= 10; size++) for (let k = 0; k < 12; k++) {
    const moves = scrambleAt('test-seed', size, k);
    expect(moves).toEqual(scrambleAt('test-seed', size, k));
    expect(moves.length).toBe(scrambleLength(size));
    expect(parseMoves(moves.join(' '), size)).toHaveLength(moves.length);
    let last = -1, segmentLength = 0;
    for (const move of moves) {
      const face = FACE_NAMES.indexOf(move.match(/[URFDLB]/)![0]);
      if (face % 3 === last % 3 && last >= 0) {
        expect(segmentLength).toBe(1);
        expect(face).toBeGreaterThan(last);
        segmentLength++;
      } else segmentLength = 1;
      last = face;
      if (size === 2) expect(face).toBeLessThan(3);
    }
    expect(isSolved(applyMoves(solvedState(size), moves, size), size)).toBe(false);
  }
});

it('filters matches with rules v1 and deterministic fallback without a cross solver', () => {
  const moves = matchScrambleAt('match', 3, 0, 1);
  const state = applyMoves(solvedState(3), moves, 3);
  expect(isSolved(state, 3)).toBe(false);
  expect(f2lSolvedAny(state)).toBe(false);
  const filter = { minCrossOptimal: 5, maxCrossOptimal: null, maxCandidates: 3 };
  expect(() => matchScrambleAt('match', 3, 0, 1, filter)).toThrow('solver');
  expect(matchScrambleAt('match', 3, 0, 1, filter, () => 0)).toEqual(scrambleCandidate('match', 3, 0, 1, 2));
  expect(matchScrambleAt('match', 3, 0, 1, filter, () => 5)).toEqual(scrambleAt('match', 3, 0));
  expect(() => matchScrambleAt('match', 3, 0, 1, {...filter, maxCandidates: 0})).toThrow();
  expect(() => scrambleAt('seed', 3, -1)).toThrow();
  expect(() => scrambleAt('seed', 3, 0, 2)).toThrow();
});
