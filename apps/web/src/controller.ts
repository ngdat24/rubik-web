import { Cube, scrambleAt } from '@rubik/engine';
import type { Move } from '@rubik/engine';

export interface CubeDisplay {
  setSize(size: number): void;
  setState(state: Uint8Array): void;
  dispose(): void;
}

/** Owns logical state; the display never applies moves or retains this Cube. */
export class DemoController {
  cube: Cube;
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
  }
  reset(): void {
    const cube = new Cube(this.cube.size);
    this.renderer.setState(cube.state);
    this.cube = cube;
  }
  scramble(seed: string, index = 0): Move[] {
    const moves = scrambleAt(seed, this.cube.size, index);
    const cube = new Cube(this.cube.size).applyMoves(moves);
    this.renderer.setState(cube.state);
    this.cube = cube;
    return moves;
  }
  dispose(): void { this.renderer.dispose(); }
}
