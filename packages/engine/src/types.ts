export enum Face {
  U = 0,
  R = 1,
  F = 2,
  D = 3,
  L = 4,
  B = 5,
}

export type CubeState = Uint8Array;
/** Canonical notation, produced by the parser or scramble generator. */
export type Move = string;

export interface MoveEvent { m: Move; t: number }
export interface CubeRun {
  index: number;
  startT: number;
  endT: number | null;
  preEvents: MoveEvent[];
  events: MoveEvent[];
  result: 'f2l' | 'solved' | 'abandoned';
}

export type Axis = 'x' | 'y' | 'z';
export type MoveType = 'face' | 'wide' | 'slice' | 'rotation';
export type Penalty = 'none' | '+2' | 'DNF';

export interface ParsedMove {
  raw: string;
  canonical: string;
  type: MoveType;
  axis: Axis;
  /** Inclusive layers counted from the positive face (R, U, F). */
  layerStart: number;
  layerEnd: number;
  /** Right-handed quarter turns around the positive axis. */
  quarterTurns: -1 | 1 | 2;
}

export interface SolveTime {
  timeMs: number;
  penalty: Penalty;
}
