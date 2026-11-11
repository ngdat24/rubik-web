import type { CubeState } from './types.js';

export function validateSize(size: number): void {
  if (!Number.isInteger(size) || size < 2 || size > 10) {
    throw new RangeError('Size must be an integer between 2 and 10');
  }
}

export function solvedState(size: number): CubeState {
  validateSize(size);
  const state = new Uint8Array(6 * size * size);
  for (let face = 0; face < 6; face++) {
    state.fill(face, face * size * size, (face + 1) * size * size);
  }
  return state;
}

export function clone(state: CubeState): CubeState {
  return state.slice();
}

export function equals(a: CubeState, b: CubeState): boolean {
  return a.length === b.length && a.every((color, index) => color === b[index]);
}

function stateSize(length: number): number {
  const size = Math.sqrt(length / 6);
  validateSize(size);
  return size;
}

/** Validates representation and color counts, not physical reachability. */
function validateState(state: CubeState): void {
  const size = stateSize(state.length);
  const counts = [0, 0, 0, 0, 0, 0];
  for (const color of state) {
    if (color > 5) throw new RangeError('Sticker colors must be between 0 and 5');
    counts[color] = counts[color]! + 1;
  }
  if (counts.some(count => count !== size * size)) {
    throw new RangeError('Each color must occur size squared times');
  }
}

export function toString(state: CubeState): string {
  validateState(state);
  return state.join('');
}

export function fromString(text: string): CubeState {
  stateSize(text.length);
  if (!/^[0-5]+$/.test(text)) throw new RangeError('State must contain only digits 0 to 5');
  const state = Uint8Array.from(text, color => Number(color));
  validateState(state);
  return state;
}

/** Deterministic unsigned FNV-1a hash; collisions still require equals(). */
export function hash(state: CubeState): number {
  let value = 0x811c9dc5;
  for (const color of state) value = Math.imul(value ^ color, 0x01000193);
  return value >>> 0;
}
