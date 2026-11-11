import type { CubeRun } from './types.js';
import { countPressMoves } from './metrics.js';

export interface RunScore { score: number; lastEndT: number; totalMoves: number }
export interface ScoreRules { mode?: 'f2lRush' | 'fullSolve'; durationMs?: number; size?: number }

/** Aggregates completed, previously verified cubes. Replay verification belongs to the server. */
export function scoreRun(cubes: readonly Pick<CubeRun, 'result' | 'endT' | 'events'>[], rules: ScoreRules = {}): RunScore {
  const result: RunScore = { score: 0, lastEndT: 0, totalMoves: 0 };
  if (rules.durationMs !== undefined && (!Number.isSafeInteger(rules.durationMs) || rules.durationMs < 0)) {
    throw new RangeError('Invalid duration');
  }
  for (const cube of cubes) {
    if (cube.result === 'abandoned' || cube.endT === null) continue;
    if (!Number.isSafeInteger(cube.endT) || cube.endT < 0) throw new RangeError('Invalid completion time');
    if (rules.durationMs !== undefined && cube.endT > rules.durationMs) continue;
    if (rules.mode === 'fullSolve' && cube.result !== 'solved') continue;
    result.score++;
    result.lastEndT = cube.endT;
    result.totalMoves += countPressMoves(cube.events.map(event => event.m), rules.size ?? 3);
  }
  return result;
}

/** Negative means A ranks first; zero means a draw. */
export function compareScores(a: RunScore, b: RunScore): number {
  return b.score - a.score || (a.score ? a.lastEndT : 0) - (b.score ? b.lastEndT : 0) || a.totalMoves - b.totalMoves;
}

export function compare(a: RunScore, b: RunScore): 'A' | 'B' | 'draw' {
  const order = compareScores(a, b);
  return order < 0 ? 'A' : order > 0 ? 'B' : 'draw';
}
