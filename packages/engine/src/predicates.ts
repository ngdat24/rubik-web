import type { CubeState } from './types.js';
import { FACE_NAMES, NORMALS, stickerIndex } from './geometry.js';
import type { Vector3 } from './geometry.js';
import { validateSize } from './state.js';

export interface CrossEdge { side: string; stickers: number[] }
export interface F2LSlot { slot: number; sides: string[]; corner: number[]; edge: number[] }
export interface FaceTable { face: number; centerIndex: number; crossEdges: CrossEdge[]; slots: F2LSlot[] }

function pieceSticker(faces: string, face: string): number {
  const cubie = [0, 0, 0];
  for (const name of faces) {
    const normal = NORMALS[FACE_NAMES.indexOf(name)]!;
    for (let axis = 0; axis < 3; axis++) cubie[axis] = cubie[axis]! + normal[axis]! * 2;
  }
  return stickerIndex(cubie as unknown as Vector3, NORMALS[FACE_NAMES.indexOf(face)]!, 3);
}

/** Construct all tables from geometry, independently of the JSON fixture. */
export function buildPredicateTables(): {
  edges: Record<string, number[]>; corners: Record<string, number[]>; faces: Record<string, FaceTable>;
} {
  const pieces = (names: string[]) => Object.fromEntries(names.map(name => [name, [...name].map(f => pieceSticker(name, f))]));
  const edges = pieces(['UF','UR','UB','UL','DF','DR','DB','DL','FR','FL','BR','BL']);
  const corners = pieces(['URF','UFL','ULB','UBR','DRF','DFL','DLB','DBR']);
  const faces: Record<string, FaceTable> = {};
  for (let face = 0; face < 6; face++) {
    const name = FACE_NAMES[face]!;
    const sides = [0,1,2,3,4,5].filter(f => f !== face && f !== (face + 3) % 6);
    const crossEdges = sides.map(side => ({ side: FACE_NAMES[side]!,
      stickers: [pieceSticker(name + FACE_NAMES[side], name), pieceSticker(name + FACE_NAMES[side], FACE_NAMES[side]!)] }));
    const slots: F2LSlot[] = [];
    for (const a of sides) for (const b of sides) {
      if (a >= b || (a + 3) % 6 === b) continue;
      const A = FACE_NAMES[a]!, B = FACE_NAMES[b]!;
      slots.push({ slot: slots.length, sides: [A, B],
        corner: [name, A, B].map(f => pieceSticker(name + A + B, f)),
        edge: [A, B].map(f => pieceSticker(A + B, f)) });
    }
    faces[name] = { face, centerIndex: face * 9 + 4, crossEdges, slots };
  }
  return { edges, corners, faces };
}

const tables = buildPredicateTables();
function table(state: CubeState, face: number): FaceTable {
  if (state.length !== 54) throw new RangeError('Cross/F2L predicates require 3x3');
  if (!Number.isInteger(face) || face < 0 || face > 5) throw new RangeError('Invalid face');
  return tables.faces[FACE_NAMES[face]!]!;
}

function stickersMatchCenters(state: CubeState, indices: readonly number[]): boolean {
  return indices.every(index => state[index] === state[Math.floor(index / 9) * 9 + 4]);
}

export function isSolved(state: CubeState, size: number): boolean {
  validateSize(size);
  if (state.length !== 6 * size * size) throw new RangeError('State length mismatch');
  const faceSize = size * size;
  for (let f = 0; f < 6; f++) for (let i = 1; i < faceSize; i++) {
    if (state[f * faceSize + i] !== state[f * faceSize]) return false;
  }
  return true;
}

export function crossSolved(state: CubeState, face: number): boolean {
  return table(state, face).crossEdges.every(edge => stickersMatchCenters(state, edge.stickers));
}

export function pairSolved(state: CubeState, face: number, slot: number): boolean {
  const entry = table(state, face);
  if (!Number.isInteger(slot) || slot < 0 || slot > 3) throw new RangeError('Invalid F2L slot');
  const pair = entry.slots[slot]!;
  return stickersMatchCenters(state, pair.corner) && stickersMatchCenters(state, pair.edge);
}

export function f2lSolved(state: CubeState, face: number): boolean {
  return crossSolved(state, face) && [0,1,2,3].every(slot => pairSolved(state, face, slot));
}

export function f2lSolvedAny(state: CubeState): boolean {
  return [0,1,2,3,4,5].some(face => f2lSolved(state, face));
}
