import { expect, it } from 'vitest';
import tables from '../../../docs/spec/07-tables.json' with { type: 'json' };
import { buildPredicateTables, crossSolved, pairSolved, f2lSolved, f2lSolvedAny, isSolved } from './predicates.js';
import { FACE_NAMES } from './geometry.js';
import { fromString, solvedState } from './state.js';
import { applyMoves, compileMove } from './moves.js';
import { loadVectors } from './test-vectors.js';

it('derives exactly the reference tables from geometry', () => {
  const generated = buildPredicateTables();
  expect(generated).toEqual({ edges: tables.edges, corners: tables.corners, faces: tables.faces });
});

for (const vector of loadVectors().predicates) {
  it(`matches predicates after ${vector.moves || 'solved'}`, () => {
    const state = applyMoves(solvedState(3), vector.moves, 3);
    expect(state).toEqual(fromString(vector.state));
    expect(isSolved(state, 3)).toBe(vector.isSolved);
    expect([...FACE_NAMES].filter((_, face) => crossSolved(state, face))).toEqual(vector.crossSolved);
    expect([...FACE_NAMES].filter((_, face) => f2lSolved(state, face))).toEqual(vector.f2lSolved);
    expect(f2lSolvedAny(state)).toBe(vector.f2lSolvedAny);
    for (let face = 0; face < 6; face++) {
      expect(f2lSolved(state, face)).toBe(crossSolved(state, face) && [0,1,2,3].every(slot => pairSolved(state, face, slot)));
    }
  });
}

it('transforms face and pair-slot predicates covariantly under whole-cube rotations', () => {
  const generated = buildPredicateTables();
  for (const vector of loadVectors().predicates) for (const rotation of ['x','y','z']) {
    const state = fromString(vector.state), rotated = applyMoves(state, rotation, 3), p = compileMove(rotation, 3);
    const movedFace = (face: number) => Math.floor(p[face * 9 + 4]! / 9);
    expect(f2lSolvedAny(rotated)).toBe(f2lSolvedAny(state));
    expect(isSolved(rotated, 3)).toBe(isSolved(state, 3));
    for (let face = 0; face < 6; face++) {
      const nextFace = movedFace(face);
      expect(crossSolved(rotated, nextFace)).toBe(crossSolved(state, face));
      expect(f2lSolved(rotated, nextFace)).toBe(f2lSolved(state, face));
      for (const pair of generated.faces[FACE_NAMES[face]!]!.slots) {
        const sides = pair.sides.map(name => FACE_NAMES[movedFace(FACE_NAMES.indexOf(name))]!).sort();
        const nextSlot = generated.faces[FACE_NAMES[nextFace]!]!.slots.find(s => [...s.sides].sort().join('') === sides.join(''))!;
        expect(pairSolved(rotated, nextFace, nextSlot.slot)).toBe(pairSolved(state, face, pair.slot));
      }
    }
  }
});

it('detects an isolated broken F2L pair and validates predicate arguments', () => {
  const state = solvedState(3);
  [state[29], state[8]] = [state[8]!, state[29]!];
  expect(crossSolved(state, 3)).toBe(true);
  expect(pairSolved(state, 3, 0)).toBe(false);
  expect(f2lSolved(state, 3)).toBe(false);
  expect(() => f2lSolvedAny(solvedState(4))).toThrow();
  expect(() => crossSolved(state, 6)).toThrow();
  expect(() => pairSolved(state, 3, 4)).toThrow();
});
