import type { CubeState, Move, ParsedMove } from './types.js';
import { parseMove, parseMoves } from './parser.js';
import { rotateVector, stickerGeometry, stickerIndex } from './geometry.js';
import { validateSize } from './state.js';

interface CompiledMove { permutation: Uint16Array; cycles: readonly Uint16Array[] }
const cache = new Map<string, CompiledMove>();

function compile(move: Move | ParsedMove, size: number): CompiledMove {
  validateSize(size);
  // Reparse external ParsedMove objects so cache keys cannot disagree with geometry.
  const parsed = parseMove(typeof move === 'string' ? move : move.canonical, size);
  const key = `${size}:${parsed.canonical}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const permutation = new Uint16Array(6 * size * size);
  const axis = { x: 0, y: 1, z: 2 }[parsed.axis];
  for (let i = 0; i < permutation.length; i++) {
    const { cubie, normal } = stickerGeometry(i, size);
    const layer = (size + 1 - cubie[axis]!) / 2;
    permutation[i] = layer >= parsed.layerStart && layer <= parsed.layerEnd
      ? stickerIndex(rotateVector(cubie, parsed.axis, parsed.quarterTurns),
        rotateVector(normal, parsed.axis, parsed.quarterTurns), size) : i;
  }
  const visited = new Uint8Array(permutation.length);
  const cycles: Uint16Array[] = [];
  for (let i = 0; i < permutation.length; i++) {
    if (visited[i] || permutation[i] === i) continue;
    const cycle: number[] = [];
    for (let j = i; !visited[j]; j = permutation[j]!) {
      visited[j] = 1;
      cycle.push(j);
    }
    cycles.push(Uint16Array.from(cycle));
  }
  const compiled = { permutation, cycles };
  cache.set(key, compiled);
  return compiled;
}

/** Source index -> destination index. Return a copy to protect the internal cache. */
export function compileMove(move: Move | ParsedMove, size: number): Uint16Array {
  return compile(move, size).permutation.slice();
}

/** Apply a previously compiled permutation without allocating. Buffers must not alias. */
export function applyPermutationInto(state: CubeState, permutation: Uint16Array, output: CubeState): CubeState {
  if (state.length !== permutation.length || output.length !== state.length) throw new RangeError('Buffer length mismatch');
  if (state.buffer === output.buffer) {
    throw new RangeError('Permutation source and output buffers must not alias');
  }
  for (let i = 0; i < state.length; i++) output[permutation[i]!] = state[i]!;
  return output;
}

/** In-place cycle application: no per-move sticker buffer allocation after compilation. */
export function applyMoveInPlace(state: CubeState, move: Move | ParsedMove, size: number): CubeState {
  const compiled = compile(move, size);
  if (state.length !== 6 * size * size) throw new RangeError('State length mismatch');
  for (const cycle of compiled.cycles) {
    let carried = state[cycle[cycle.length - 1]!]!;
    for (const index of cycle) {
      const next = state[index]!;
      state[index] = carried;
      carried = next;
    }
  }
  return state;
}

export function applyMove(state: CubeState, move: Move | ParsedMove, size: number): CubeState {
  const output = state.slice();
  return applyMoveInPlace(output, move, size);
}

export function applyMoves(state: CubeState, moves: string | readonly (Move | ParsedMove)[], size: number): CubeState {
  validateSize(size);
  if (state.length !== 6 * size * size) throw new RangeError('State length mismatch');
  const sequence = typeof moves === 'string' ? parseMoves(moves, size) : moves;
  const output = state.slice();
  for (const move of sequence) applyMoveInPlace(output, move, size);
  return output;
}

export function invert(moves: string | readonly (Move | ParsedMove)[], size: number = 3): Move[] {
  const sequence = typeof moves === 'string' ? parseMoves(moves, size) : moves;
  return [...sequence].reverse().map(move => {
    const canonical = parseMove(typeof move === 'string' ? move : move.canonical, size).canonical;
    return canonical.endsWith('2') ? canonical : canonical.endsWith("'") ? canonical.slice(0, -1) : `${canonical}'`;
  });
}
