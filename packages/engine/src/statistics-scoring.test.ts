import { expect, it } from 'vitest';
import { statistic, ao5, mo3, formatTime } from './statistics.js';
import type { StatisticKind } from './statistics.js';
import type { CubeRun, Penalty } from './types.js';
import { compare, scoreRun } from './scoring.js';
import { loadVectors } from './test-vectors.js';

for (const vector of loadVectors().stats) {
  it(vector.name, () => {
    const solves = vector.solves.map(s => ({timeMs: s.ms, penalty: s.penalty as Penalty}));
    expect(statistic(vector.kind as StatisticKind, solves)).toEqual({resultMs: vector.resultMs, display: vector.display});
  });
}
for (const vector of loadVectors().score.scoreRun) {
  it(vector.name, () => {
    const cubes = vector.cubes.map(c => ({...c, result: c.result as CubeRun['result']}));
    expect(scoreRun(cubes)).toEqual(vector.expected);
  });
}
for (const vector of loadVectors().score.compare) {
  it(vector.name, () => { expect(compare(vector.a, vector.b)).toBe(vector.winner); });
}

it('uses latest windows, truncates display and recalculates after penalty edits', () => {
  const solves = Array.from({length: 6}, (_, i) => ({timeMs: i === 0 ? 999999 : 10000, penalty: 'none' as Penalty}));
  expect(ao5(solves).resultMs).toBe(10000);
  expect(mo3(solves).resultMs).toBe(10000);
  solves[5]!.penalty = 'DNF';
  expect(mo3(solves).display).toBe('DNF');
  solves.pop();
  expect(mo3(solves).display).toBe('10.00');
  expect(formatTime(12345)).toBe('12.34');
  expect(formatTime(0)).toBe('0.00');
});

it('counts completion exactly at cutoff and respects the requested mode', () => {
  const cubes: CubeRun[] = [
    {index: 0, startT: 0, endT: 1000, result: 'f2l', preEvents: [], events: [{m: 'R',t: 1000}]},
    {index: 1, startT: 1000, endT: 2000, result: 'solved', preEvents: [], events: [{m: 'M',t: 2000}]},
    {index: 2, startT: 2000, endT: 2001, result: 'solved', preEvents: [], events: [{m: 'R',t: 2001}]},
  ];
  expect(scoreRun(cubes, {durationMs: 2000})).toEqual({score: 2, lastEndT: 2000, totalMoves: 3});
  expect(scoreRun(cubes, {mode: 'fullSolve', durationMs: 2000})).toEqual({score: 1, lastEndT: 2000, totalMoves: 2});
});
