import type { SolveTime } from './types.js';

export type StatisticKind = 'single' | 'mo3' | 'ao5' | 'ao12';
export interface Statistic { resultMs: number | null; display: string }

function effectiveTime(solve: SolveTime): number | null {
  if (!Number.isSafeInteger(solve.timeMs) || solve.timeMs < 0) throw new RangeError('Invalid solve time');
  if (!['none', '+2', 'DNF'].includes(solve.penalty)) throw new RangeError('Invalid penalty');
  return solve.penalty === 'DNF' ? null : solve.timeMs + (solve.penalty === '+2' ? 2000 : 0);
}

/** Truncate to centiseconds, never round display values before ranking. */
export function formatTime(timeMs: number | null): string {
  if (timeMs === null) return 'DNF';
  if (!Number.isSafeInteger(timeMs) || timeMs < 0) throw new RangeError('Invalid time');
  const cs = Math.floor(timeMs / 10), seconds = Math.floor(cs / 100);
  const fraction = String(cs % 100).padStart(2, '0');
  return seconds < 60 ? `${seconds}.${fraction}` : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}.${fraction}`;
}

/** Input must be one session and one cube size; averages use the latest window. */
export function statistic(kind: StatisticKind, solves: readonly SolveTime[]): Statistic {
  const required = {single: 0, mo3: 3, ao5: 5, ao12: 12}[kind];
  if (required === undefined) throw new RangeError('Unknown statistic');
  if (solves.length < required || solves.length === 0) return { resultMs: null, display: '-' };
  const values = (required ? solves.slice(-required) : solves).map(effectiveTime);
  if (kind === 'single') {
    const valid = values.filter((v): v is number => v !== null);
    const resultMs = valid.length ? valid.reduce((best, value) => Math.min(best, value)) : null;
    return { resultMs, display: resultMs === null ? '-' : formatTime(resultMs) };
  }
  const dnfCount = values.filter(v => v === null).length;
  if ((kind === 'mo3' && dnfCount > 0) || dnfCount >= 2) return { resultMs: null, display: 'DNF' };
  let counted = values.filter((v): v is number => v !== null).sort((a, b) => a - b);
  if (kind !== 'mo3') counted = counted.slice(1, dnfCount ? undefined : -1);
  const resultMs = Math.round(counted.reduce((sum, value) => sum + value, 0) / counted.length);
  return { resultMs, display: formatTime(resultMs) };
}

export const single = (solves: readonly SolveTime[]): Statistic => statistic('single', solves);
export const mo3 = (solves: readonly SolveTime[]): Statistic => statistic('mo3', solves);
export const ao5 = (solves: readonly SolveTime[]): Statistic => statistic('ao5', solves);
export const ao12 = (solves: readonly SolveTime[]): Statistic => statistic('ao12', solves);
