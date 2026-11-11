import type { CubeState, Move } from './types.js';
import { FACE_NAMES } from './geometry.js';
import { mulberry32, xmur3 } from './prng.js';
import { solvedState, validateSize } from './state.js';
import { applyMoves } from './moves.js';
import { f2lSolvedAny, isSolved } from './predicates.js';

const LENGTHS: Readonly<Record<number, number>> = Object.freeze({2:9,3:20,4:40,5:60,6:80,7:100,8:100,9:110,10:120});
export function scrambleLength(size: number): number { validateSize(size); return LENGTHS[size]!; }

function validateIndex(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) throw new RangeError('Scramble index must be a nonnegative safe integer');
}

// Immutable genVersion 1 procedure approved in 05 section 3.1.
function generateV1(seed: string, size: number, k: number, j: number): Move[] {
  const u32 = mulberry32(xmur3(`${seed}|${size}|${k}|${j}`)());
  const candidates: { face: number; move: Move }[] = [];
  for (let face = 0; face < (size === 2 ? 3 : 6); face++) {
    const maxWidth = size >= 4 && face < 3 ? Math.floor(size / 2) : 1;
    for (let width = 1; width <= maxWidth; width++) for (const suffix of ['', "'", '2']) {
      const body = width === 1 ? FACE_NAMES[face]! : `${width === 2 ? '' : width}${FACE_NAMES[face]}w`;
      candidates.push({ face, move: body + suffix });
    }
  }
  const result: Move[] = [];
  let last = -1, segmentLength = 0;
  for (let i = 0; i < LENGTHS[size]!; i++) {
    const pool = candidates.filter(c => last === -1 || c.face % 3 !== last % 3 || (segmentLength === 1 && last < c.face));
    const chosen = pool[Math.floor(u32() * pool.length / 4294967296)]!;
    segmentLength = last !== -1 && chosen.face % 3 === last % 3 ? segmentLength + 1 : 1;
    last = chosen.face;
    result.push(chosen.move);
  }
  return result;
}

const generators: Readonly<Record<number, typeof generateV1>> = Object.freeze({1: generateV1});
export function scrambleCandidate(seed: string, size: number, k: number, genVersion: number, j: number): Move[] {
  validateSize(size); validateIndex(k); validateIndex(j);
  if (typeof seed !== 'string') throw new TypeError('Seed must be a string');
  const generate = Object.hasOwn(generators, genVersion) ? generators[genVersion] : undefined;
  if (!generate) throw new RangeError(`Unsupported generator version: ${genVersion}`);
  return generate(seed, size, k, j);
}

export function scrambleAt(seed: string, size: number, k: number, genVersion: number = 1): Move[] {
  return scrambleCandidate(seed, size, k, genVersion, 0);
}

export interface ScrambleFilter {
  minCrossOptimal: number | null;
  maxCrossOptimal: number | null;
  maxCandidates: number;
}
export const DEFAULT_SCRAMBLE_FILTER: Readonly<ScrambleFilter> = Object.freeze({ minCrossOptimal: null, maxCrossOptimal: null, maxCandidates: 1000 });
export type CrossDistance = (state: CubeState, face: number) => number;

/** Cross thresholds require an injected solver (Stage 7); rules v1 needs none. */
export function matchScrambleAt(seed: string, size: number, k: number, genVersion: number,
  filter: Readonly<ScrambleFilter> = DEFAULT_SCRAMBLE_FILTER, crossDistance?: CrossDistance): Move[] {
  if (!Number.isInteger(filter.maxCandidates) || filter.maxCandidates < 1 || filter.maxCandidates > 1000) {
    throw new RangeError('maxCandidates must be 1..1000');
  }
  for (const limit of [filter.minCrossOptimal, filter.maxCrossOptimal]) {
    if (limit !== null && (!Number.isInteger(limit) || limit < 0)) throw new RangeError('Invalid cross threshold');
  }
  if (filter.minCrossOptimal !== null && filter.maxCrossOptimal !== null && filter.minCrossOptimal > filter.maxCrossOptimal) {
    throw new RangeError('Inverted cross thresholds');
  }
  const hasCrossFilter = filter.minCrossOptimal !== null || filter.maxCrossOptimal !== null;
  if (hasCrossFilter && (size !== 3 || !crossDistance)) throw new Error('Cross filtering requires a 3x3 cross solver');
  let last: Move[] = [];
  for (let j = 0; j < filter.maxCandidates; j++) {
    last = scrambleCandidate(seed, size, k, genVersion, j);
    const state = applyMoves(solvedState(size), last, size);
    if (isSolved(state, size) || (size === 3 && f2lSolvedAny(state))) continue;
    if (hasCrossFilter) {
      const distances = [0,1,2,3,4,5].map(face => crossDistance!(state, face));
      if (distances.some(d => !Number.isInteger(d) || d < 0)) throw new Error('Invalid cross solver result');
      const minimum = Math.min(...distances);
      if (filter.minCrossOptimal !== null && minimum < filter.minCrossOptimal) continue;
      if (filter.maxCrossOptimal !== null && minimum > filter.maxCrossOptimal) continue;
    }
    return last;
  }
  return last;
}
