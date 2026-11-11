import { Cube, parseMove, scrambleAt } from '@rubik/engine';
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
export class DemoController {
  cube: Cube;
  lastInput: MoveInput | undefined;
  constructor(readonly renderer: CubeDisplay, size = 3) {
    this.cube = new Cube(size);
    renderer.setSize(size);
    renderer.setState(this.cube.state);
  }
  setSize(size: number): void {
    const cube = new Cube(size);
    this.renderer.setSize(size);
    this.renderer.setState(cube.state);
    this.cube = cube;
    this.lastInput = undefined;
  }
  reset(): void {
    const cube = new Cube(this.cube.size);
    this.renderer.setState(cube.state);
    this.cube = cube;
    this.lastInput = undefined;
  }
  scramble(seed: string, index = 0): Move[] {
    const moves = scrambleAt(seed, this.cube.size, index);
    const cube = new Cube(this.cube.size).applyMoves(moves);
    this.renderer.setState(cube.state);
    this.cube = cube;
    this.lastInput = undefined;
    return moves;
  }
  move(move: Move, inputTime: number): boolean {
    if (!Number.isFinite(inputTime) || inputTime < 0) throw new RangeError('Invalid input timestamp');
    const parsed = parseMove(move, this.cube.size);
    const before = this.cube, beforeInput = this.lastInput;
    this.cube = before.clone().applyMove(parsed);
    this.lastInput = { m: parsed.canonical, timeStamp: inputTime };
    try { this.renderer.enqueueMove(parsed.canonical, this.cube.state); }
    catch (error) { this.cube = before; this.lastInput = beforeInput; throw error; }
    return true;
  }
  moves(moves: readonly Move[], inputTime: number): void {
    if (!Number.isFinite(inputTime) || inputTime < 0) throw new RangeError('Invalid input timestamp');
    if (!moves.length) return;
    const next = this.cube.clone();
    const snapshots = moves.map(move => {
      const parsed = parseMove(move, next.size);
      next.applyMove(parsed);
      return {move: parsed.canonical, stateAfter: next.state.slice()};
    });
    const before = this.cube, beforeInput = this.lastInput;
    this.cube = next;
    this.lastInput = {m: snapshots.at(-1)!.move, timeStamp: inputTime};
    try { this.renderer.enqueueMoves(snapshots); }
    catch (error) { this.cube = before; this.lastInput = beforeInput; throw error; }
  }
  dispose(): void { this.renderer.dispose(); }
}
