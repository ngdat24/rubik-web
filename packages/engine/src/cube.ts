import type { CubeState } from './types.js';

export class Cube {
  readonly size: number;
  state: CubeState;

  constructor(size: number = 3) {
    if (size < 2 || size > 10) {
      throw new Error('Size must be between 2 and 10');
    }
    this.size = size;
    this.state = this.createSolvedState();
  }

  createSolvedState(): CubeState {
    const totalStickers = 6 * this.size * this.size;
    const state = new Uint8Array(totalStickers);
    const faceSize = this.size * this.size;

    for (let face = 0; face < 6; face++) {
      const offset = face * faceSize;
      state.fill(face, offset, offset + faceSize);
    }
    return state;
  }

  isSolved(): boolean {
    const faceSize = this.size * this.size;
    for (let face = 0; face < 6; face++) {
      const offset = face * faceSize;
      const faceColor = this.state[offset];
      for (let i = 1; i < faceSize; i++) {
        if (this.state[offset + i] !== faceColor) {
          return false;
        }
      }
    }
    return true;
  }
}
