import { Cube, parseMove, parseMoves, scrambleAt } from '@rubik/engine';
import type { Move } from '@rubik/engine';

/** Raw monotonic input timestamp; Phase 5 converts this to relative integer event times. */
export interface MoveInput { m: Move; timeStamp: number }

export interface CubeDisplay {
  setSize(size: number): void;
  setState(state: Uint8Array): void;
  readonly isAnimating: boolean;
  enqueueMove(move: Move, stateAfter: Uint8Array): void;
  enqueueMoves(moves: readonly {move: Move; stateAfter: Uint8Array}[]): void;
  dispose(): void;
}

/** Owns logical state; the display never applies moves or retains this Cube. */
export interface MoveApplied { move: Move; stateAfter: Uint8Array; t: number }

export class CubeController {
  inputEnabled = true;
  #listeners = new Set<(event: MoveApplied) => void>();
  /** Inspection snapshot: callers cannot mutate the owned engine. */
  get cube(): Cube { return this.#cube.clone(); }
  onMoveApplied(listener: (event: MoveApplied) => void): () => void {
    this.#listeners.add(listener);
    return () => { this.#listeners.delete(listener); };
  }
  #emit(move: Move, stateAfter: Uint8Array, t: number): void {
    for (const listener of [...this.#listeners]) listener({move, stateAfter: stateAfter.slice(), t});
  }
  #cube: Cube;
  lastInput: MoveInput | undefined;
  constructor(readonly renderer: CubeDisplay, size = 3) {
    this.#cube = new Cube(size);
    renderer.setSize(size);
    renderer.setState(this.#cube.state);
  }
  setSize(size: number): void {
    const cube = new Cube(size);
    this.renderer.setSize(size);
    this.renderer.setState(cube.state);
    this.#cube = cube;
    this.lastInput = undefined;
  }
  reset(): void {
    const cube = new Cube(this.#cube.size);
    this.renderer.setState(cube.state);
    this.#cube = cube;
    this.lastInput = undefined;
  }
  scramble(seed: string, index = 0): Move[] {
    const moves = scrambleAt(seed, this.#cube.size, index);
    const cube = new Cube(this.#cube.size).applyMoves(moves);
    this.renderer.setState(cube.state);
    this.#cube = cube;
    this.lastInput = undefined;
    return moves;
  }
  applyMove(move: Move, inputTime: number): boolean {
    if (!this.inputEnabled) return false;
    if (!Number.isFinite(inputTime) || inputTime < 0) throw new RangeError('Invalid input timestamp');
    const parsed = parseMove(move, this.#cube.size);
    const before = this.#cube, beforeInput = this.lastInput;
    this.#cube = before.clone().applyMove(parsed);
    this.lastInput = { m: parsed.canonical, timeStamp: inputTime };
    try { this.renderer.enqueueMove(parsed.canonical, this.#cube.state); }
    catch (error) { this.#cube = before; this.lastInput = beforeInput; throw error; }
    this.#emit(parsed.canonical, this.#cube.state, inputTime);
    return true;
  }
  moves(moves: readonly Move[], inputTime: number): void {
    if (!this.inputEnabled) return;
    if (!Number.isFinite(inputTime) || inputTime < 0) throw new RangeError('Invalid input timestamp');
    if (!moves.length) return;
    const next = this.#cube.clone();
    const snapshots = moves.map(move => {
      const parsed = parseMove(move, next.size);
      next.applyMove(parsed);
      return {move: parsed.canonical, stateAfter: next.state.slice()};
    });
    const before = this.#cube, beforeInput = this.lastInput;
    this.#cube = next;
    this.lastInput = {m: snapshots.at(-1)!.move, timeStamp: inputTime};
    try { this.renderer.enqueueMoves(snapshots); }
    catch (error) { this.#cube = before; this.lastInput = beforeInput; throw error; }
    for (const snapshot of snapshots) this.#emit(snapshot.move, snapshot.stateAfter, inputTime);
  }
  sequence(text: string, inputTime: number): number {
    if (!this.inputEnabled) return 0;
    const moves = parseMoves(text, this.#cube.size).map(move => move.canonical);
    if (moves.length > 2000) throw new RangeError('Tối đa 2000 nước mỗi chuỗi');
    this.moves(moves, inputTime);
    return moves.length;
  }
  dispose(): void { this.inputEnabled = false; this.#listeners.clear(); this.renderer.dispose(); }
}

export { DEFAULT_KEYMAP, resolveKey } from './keyboard.js';
export type { Keymap, KeyModifiers } from './keyboard.js';

export { KEYMAP_STORAGE_KEY, defaultSettings, isAssignableCode, canonicalBinding, validProfileName, validateSettings, importSettings, loadSettings, saveSettings, bindingConflict, assignBinding } from './keymap-settings.js';
export type { KeymapSettings, KeymapStorage, BindingConflict } from './keymap-settings.js';
