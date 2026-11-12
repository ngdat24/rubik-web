import { statistic } from '@rubik/engine';
import type { Penalty, StatisticKind } from '@rubik/engine';
import type { Solve } from './index.js';

/** The recorded Solve remains original; a local override is separate metadata. */
export interface HistoryEntry { solve: Solve; penaltyOverride: Penalty | null }
function copy(entry: HistoryEntry): HistoryEntry {
  return {...entry, solve: {...entry.solve, preEvents: entry.solve.preEvents.map(e=>({...e})), events: entry.solve.events.map(e=>({...e}))}};
}
export class SolveHistory {
  #entries: HistoryEntry[] = [];
  entries(): HistoryEntry[] { return this.#entries.map(copy); }
  merge(entries: readonly HistoryEntry[]): number {
    let added=0;
    for(const entry of entries) if(!this.#entries.some(old=>old.solve.id===entry.solve.id)) {
      this.#entries.push(copy(entry)); added++;
    }
    if(added)this.#entries.sort((a,b)=>Date.parse(a.solve.startedAt)-Date.parse(b.solve.startedAt));
    return added;
  }
  add(solve: Solve): boolean {
    if (this.#entries.some(entry=>entry.solve.id===solve.id)) return false;
    this.#entries.push(copy({solve,penaltyOverride:null})); return true;
  }
  list(size: number): HistoryEntry[] { return this.#entries.filter(entry=>entry.solve.size===size).map(copy).reverse(); }
  penalty(id: string): Penalty | undefined {
    const entry=this.#entries.find(entry=>entry.solve.id===id);
    return entry && (entry.penaltyOverride ?? entry.solve.penalty);
  }
  edit(id: string, penalty: Penalty | null): boolean {
    if (penalty!==null && !['none','+2','DNF'].includes(penalty)) throw new RangeError('Invalid penalty');
    const entry=this.#entries.find(entry=>entry.solve.id===id); if (!entry) return false;
    entry.penaltyOverride=penalty; return true;
  }
  delete(id: string): boolean {
    const index=this.#entries.findIndex(entry=>entry.solve.id===id);if(index<0)return false;
    this.#entries.splice(index,1);return true;
  }
  statistics(size: number) {
    const times=this.#entries.filter(entry=>entry.solve.size===size).map(entry=>({timeMs:entry.solve.timeMs,penalty:entry.penaltyOverride??entry.solve.penalty}));
    return Object.fromEntries((['single','mo3','ao5','ao12'] as StatisticKind[]).map(kind=>[kind,statistic(kind,times)]));
  }
}
