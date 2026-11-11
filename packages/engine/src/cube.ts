import type { CubeState } from './types.js'; // import từ types về Uint8array
import { solvedState, validateSize, clone, equals, toString, fromString, hash } from './state.js';
import { applyMoveInPlace, applyMoves } from './moves.js';
import { isSolved } from './predicates.js';
import type { Move, ParsedMove } from './types.js';

export class Cube {
  readonly size: number;
  state: CubeState;

  constructor(size: number = 3) {
    validateSize(size);
    this.size = size;
    this.state = this.createSolvedState();
  }

  createSolvedState(): CubeState {
    return solvedState(this.size);
  }

  clone(): Cube {
    const copy = new Cube(this.size);
    copy.state = clone(this.state);
    return copy;
  }

  equals(other: Cube): boolean {
    return this.size === other.size && equals(this.state, other.state);
  }

  toString(): string {
    return toString(this.state);
  }

  static fromString(text: string): Cube {
    const state = fromString(text);
    const cube = new Cube(Math.sqrt(state.length / 6));
    cube.state = state;
    return cube;
  }

  hash(): number {
    return hash(this.state);
  }

  isSolved(): boolean {
    return isSolved(this.state, this.size);
  }

  applyMove(move: Move | ParsedMove): this {
    applyMoveInPlace(this.state, move, this.size);
    return this;
  }

  applyMoves(moves: string | readonly (Move | ParsedMove)[]): this {
    this.state = applyMoves(this.state, moves, this.size);
    return this;
  }
}
