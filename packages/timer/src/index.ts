import { ENGINE_VERSION, isSolved, parseMove, validateSize } from '@rubik/engine';
import type { Move, MoveEvent, ParsedMove, Penalty } from '@rubik/engine';

export type TimerPhase = 'idle' | 'inspecting' | 'solving' | 'finished';
export interface Solve {
  schemaVersion: 1; id: string; size: number; seed: string; scrambleIndex: number;
  scrambleSource: 'generated'; genVersion: number; engineVersion: string;
  preEvents: MoveEvent[]; events: MoveEvent[];
  inspectionMs: number; timeMs: number; penalty: Penalty; startedAt: string;
}
export interface ScrambleContext { size: number; seed: string; scrambleIndex: number }

/** Pure input-clock machine. The injected Date is metadata, never elapsed time. */
export class SolveTimer {
  #phase: TimerPhase = 'idle';
  #context: ScrambleContext | undefined;
  #run: Solve | undefined;
  #result: Solve | undefined;
  #inspectionStart = 0;
  #solveStart = 0;
  #lastMoveStamp = 0;
  #listeners = new Set<(phase: TimerPhase) => void>();
  constructor(private readonly options: {newId: () => string; now: () => Date}) {}
  get phase(): TimerPhase { return this.#phase; }
  get armed(): boolean { return this.#context !== undefined; }
  get result(): Solve | undefined { return this.#result && copySolve(this.#result); }
  onChange(listener: (phase: TimerPhase) => void): () => void {
    this.#listeners.add(listener); return () => {this.#listeners.delete(listener);};
  }
  #transition(phase: TimerPhase): void {
    if (this.#phase === phase) return;
    this.#phase = phase;
    for (const listener of [...this.#listeners]) listener(phase);
  }
  arm(context: ScrambleContext): void {
    if (this.#phase !== 'idle' && this.#phase !== 'finished') throw new Error('Timer is running');
    validateSize(context.size);
    if (typeof context.seed !== 'string' || !Number.isSafeInteger(context.scrambleIndex) || context.scrambleIndex < 0) throw new RangeError('Invalid scramble context');
    this.#context = {...context}; this.#result = undefined; this.#run = undefined;
    this.#transition('idle');
  }
  disarm(): void { this.#context = undefined; this.cancel(); }
  cancel(): void {
    this.#run = undefined; this.#result = undefined;
    this.#transition('idle');
  }
  startInspection(stamp: number): boolean {
    if (this.#phase !== 'idle' || !this.#context || !this.#validStamp(stamp)) return false;
    const run: Solve = {schemaVersion: 1, id: this.options.newId(), ...this.#context,
      scrambleSource: 'generated', genVersion: 1, engineVersion: ENGINE_VERSION,
      preEvents: [], events: [], inspectionMs: 0, timeMs: 0, penalty: 'none',
      startedAt: this.options.now().toISOString()};
    this.#run = run; this.#result = undefined; this.#inspectionStart = stamp; this.#lastMoveStamp = stamp;
    this.#transition('inspecting'); return true;
  }
  #validStamp(stamp: number): boolean { return Number.isFinite(stamp) && stamp >= 0; }
  advance(stamp: number): void {
    if (this.#phase !== 'inspecting' || !this.#validStamp(stamp) || stamp < this.#lastMoveStamp) return;
    const elapsed = Math.floor(stamp - this.#inspectionStart);
    if (elapsed > 17000) {
      this.#run!.inspectionMs = elapsed; this.#run!.penalty = 'DNF'; this.#finish();
    }
  }
  canApply(move: ParsedMove, stamp: number): boolean {
    if (!this.#validStamp(stamp) || stamp < this.#lastMoveStamp || !this.#context) return false;
    try { parseMove(move.canonical, this.#context.size); } catch { return false; }
    this.advance(stamp);
    return this.#phase === 'inspecting' || this.#phase === 'solving';
  }
  recordMove(move: Move, stateAfter: Uint8Array, stamp: number): void {
    if (!this.#context) throw new Error('Timer is not armed');
    const parsed = parseMove(move, this.#context.size);
    if (!this.canApply(parsed, stamp)) return;
    if (stateAfter.length !== 6*this.#context.size**2 || stateAfter.some(v => v > 5)) throw new RangeError('Invalid state snapshot');
    const run = this.#run!;
    if (this.#phase === 'inspecting' && parsed.type === 'rotation') {
      run.preEvents.push({m: parsed.canonical, t: Math.floor(stamp-this.#inspectionStart)});
      this.#lastMoveStamp = stamp; return;
    }
    const first = this.#phase === 'inspecting';
    if (first) {
      run.inspectionMs = Math.floor(stamp-this.#inspectionStart);
      run.penalty = run.inspectionMs > 15000 ? '+2' : 'none'; this.#solveStart = stamp;
    }
    const t = Math.floor(stamp-this.#solveStart);
    run.events.push({m: parsed.canonical, t}); this.#lastMoveStamp = stamp;
    if (isSolved(stateAfter, run.size)) {run.timeMs = t; this.#finish();}
    else if (first) this.#transition('solving');
  }
  #finish(): void { this.#result = copySolve(this.#run!); this.#transition('finished'); }
}

function copySolve(solve: Solve): Solve { return {...solve,preEvents:solve.preEvents.map(e=>({...e})),events:solve.events.map(e=>({...e}))}; }
