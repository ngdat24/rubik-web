import type { Axis } from './types.js';
import { validateSize } from './state.js';

export type Vector3 = readonly [number, number, number];
export interface StickerGeometry { readonly cubie: Vector3; readonly normal: Vector3 }
export const FACE_NAMES = 'URFDLB';
export const NORMALS: readonly Vector3[] = Object.freeze([
  [0, 1, 0], [1, 0, 0], [0, 0, 1], [0, -1, 0], [-1, 0, 0], [0, 0, -1],
].map(v => Object.freeze(v) as Vector3));
const RIGHT: readonly Vector3[] = [[1,0,0],[0,0,-1],[1,0,0],[1,0,0],[0,0,1],[-1,0,0]];
const DOWN: readonly Vector3[] = [[0,0,1],[0,-1,0],[0,-1,0],[0,0,-1],[0,-1,0],[0,-1,0]];
const cache = new Map<number, readonly StickerGeometry[]>();

/** Integer coordinates: -(N-1), -(N-3), ..., N-1. */
export function stickerGeometry(index: number, size: number): StickerGeometry {
  validateSize(size);
  if (!Number.isInteger(index) || index < 0 || index >= 6 * size * size) {
    throw new RangeError('Sticker index out of range');
  }
  let slots = cache.get(size);
  if (!slots) {
    const generated: StickerGeometry[] = [];
    for (let f = 0; f < 6; f++) {
      for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
        const normal = NORMALS[f]!;
        const cubie = normal.map((n, axis) => n * (size - 1)
          + RIGHT[f]![axis]! * (2 * c - size + 1)
          + DOWN[f]![axis]! * (2 * r - size + 1)) as [number, number, number];
        generated.push(Object.freeze({ cubie: Object.freeze(cubie), normal }));
      }
    }
    slots = Object.freeze(generated);
    cache.set(size, slots);
  }
  return slots[index]!;
}

export function stickerIndex(cubie: Vector3, normal: Vector3, size: number): number {
  validateSize(size);
  const face = NORMALS.findIndex(n => n.every((v, i) => v === normal[i]));
  if (face < 0) throw new RangeError('Invalid sticker normal');
  const dot = (a: Vector3, b: Vector3) => a.reduce((sum, x, i) => sum + x * b[i]!, 0);
  if (cubie.some(v => !Number.isInteger(v) || Math.abs(v) > size - 1 || (v + size - 1) % 2 !== 0)
    || dot(cubie, normal) !== size - 1) throw new RangeError('Invalid sticker position');
  const row = (dot(cubie, DOWN[face]!) + size - 1) / 2;
  const col = (dot(cubie, RIGHT[face]!) + size - 1) / 2;
  return face * size * size + row * size + col;
}

export function rotateVector(v: Vector3, axis: Axis, quarterTurns: number): Vector3 {
  let [x, y, z] = v;
  const turns = ((quarterTurns % 4) + 4) % 4;
  for (let t = 0; t < turns; t++) {
    if (axis === 'x') [y, z] = [-z, y];
    else if (axis === 'y') [x, z] = [z, -x];
    else [x, y] = [-y, x];
  }
  return [x, y, z];
}
