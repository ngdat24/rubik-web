import { expect, it, vi } from 'vitest';
import { Cube, scrambleAt } from '@rubik/engine';
import { CubeController } from '../src/index.js';

it('uses engine state for scramble/reset and reuses the same display for every N', () => {
  let shown = new Uint8Array();
  const display = { isAnimating: false, enqueueMove: vi.fn(), enqueueMoves: vi.fn(), setSize: vi.fn(), setState: vi.fn((state: Uint8Array) => {shown = state.slice();}), dispose: vi.fn() };
  const controller = new CubeController(display);
  for (let size = 2; size <= 10; size++) {
    controller.setSize(size);
    expect(shown).toEqual(new Cube(size).state);
    const moves = controller.scramble('r2-seed');
    expect(moves).toEqual(scrambleAt('r2-seed', size, 0));
    expect(shown).toEqual(new Cube(size).applyMoves(moves).state);
    expect(shown).toEqual(controller.cube.state);
    const first = shown.slice();
    controller.scramble('r2-seed');
    expect(shown).toEqual(first); // scramble starts from solved, never from the last scramble
    controller.reset();
    expect(shown).toEqual(new Cube(size).state);
    expect(display.dispose).not.toHaveBeenCalled();
  }
  controller.dispose();
  expect(display.dispose).toHaveBeenCalledOnce();
});

it('keeps the current display and cube when a size is invalid', () => {
  const display = { isAnimating: false, enqueueMove: vi.fn(), enqueueMoves: vi.fn(), setSize: vi.fn(), setState: vi.fn(), dispose: vi.fn() };
  const controller = new CubeController(display);
  const before = controller.cube;
  expect(() => controller.setSize(11)).toThrow();
  expect(controller.cube.state).toEqual(before.state);
  expect(display.setSize).toHaveBeenCalledTimes(1);
});

it('accepts and timestamps input while animation is busy and rolls back a rejected enqueue', () => {
  const display = { isAnimating: false, enqueueMove: vi.fn(), enqueueMoves: vi.fn(), setSize: vi.fn(), setState: vi.fn(), dispose: vi.fn() };
  const controller = new CubeController(display);
  display.enqueueMove.mockImplementationOnce((move, state) => {
    expect(controller.lastInput).toEqual({m: 'R', timeStamp: 42.75});
    expect(controller.cube.state).toEqual(state);
    expect(move).toBe('R');
  });
  expect(controller.applyMove('R', 42.75)).toBe(true);
  expect(controller.cube.state).toEqual(new Cube().applyMoves('R').state);
  display.isAnimating = true;
  expect(controller.applyMove('U', 50)).toBe(true);
  expect(controller.cube.state).toEqual(new Cube().applyMoves('R U').state);
  expect(controller.lastInput!.timeStamp).toBe(50);
  display.isAnimating = false;
  display.enqueueMove.mockImplementation(() => {throw new Error('display failed');});
  expect(() => controller.applyMove('F', 60)).toThrow('display failed');
  expect(controller.cube.state).toEqual(new Cube().applyMoves('R U').state);
  expect(controller.lastInput).toEqual({m: 'U', timeStamp: 50});
  controller.reset();
  expect(controller.lastInput).toBeUndefined();
});

it('applies whole batches immediately with independent snapshots and atomic validation', () => {
  const display = { isAnimating: true, enqueueMove: vi.fn(), enqueueMoves: vi.fn(), setSize: vi.fn(), setState: vi.fn(), dispose: vi.fn() };
  const controller = new CubeController(display);
  controller.moves(['R','R','U2'], 100);
  expect(controller.cube.state).toEqual(new Cube().applyMoves('R R U2').state);
  const snapshots = display.enqueueMoves.mock.calls[0]![0];
  expect(snapshots.map(item => item.move)).toEqual(['R','R','U2']);
  expect(snapshots[0].stateAfter).toEqual(new Cube().applyMove('R').state);
  expect(snapshots[1].stateAfter).toEqual(new Cube().applyMove('R2').state);
  expect(snapshots[0].stateAfter).not.toBe(snapshots[1].stateAfter);
  const before = controller.cube;
  expect(() => controller.moves(['R','bad'], 110)).toThrow();
  expect(controller.cube.state).toEqual(before.state);
  display.enqueueMoves.mockImplementation(() => {throw new Error('display failed');});
  expect(() => controller.moves(['F','B'], 120)).toThrow();
  expect(controller.cube.state).toEqual(before.state);
  expect(controller.lastInput).toEqual({m: 'U2', timeStamp: 100});
});

it('parses complete sequences before accepting any moves', () => {
  const display = {isAnimating: false, enqueueMove: vi.fn(), enqueueMoves: vi.fn(), setSize: vi.fn(), setState: vi.fn(), dispose: vi.fn()};
  const controller = new CubeController(display);
  expect(controller.sequence("r U2 R2'", 12)).toBe(3);
  expect(controller.cube.state).toEqual(new Cube().applyMoves('Rw U2 R2').state);
  const before = controller.cube;
  expect(() => controller.sequence('R invalid', 13)).toThrow();
  expect(controller.cube.state).toEqual(before.state);
  expect(() => controller.sequence('R '.repeat(2001), 14)).toThrow('2000');
  expect(controller.cube.state).toEqual(before.state);
});

it('emits accepted input timestamps without waiting for animation and isolates snapshots', () => {
  const display = {isAnimating: true, enqueueMove: vi.fn(), enqueueMoves: vi.fn(), setSize: vi.fn(), setState: vi.fn(), dispose: vi.fn()};
  const controller = new CubeController(display);
  const events: {move: string; stateAfter: Uint8Array; t: number}[] = [];
  const unsubscribe = controller.onMoveApplied(event => events.push(event));
  controller.applyMove('R', 42.75);
  controller.moves(['U', "F'"], 50.125);
  expect(events.map(({move, t}) => ({move, t}))).toEqual([{move:'R',t:42.75},{move:'U',t:50.125},{move:"F'",t:50.125}]);
  expect(events[0]!.stateAfter).toEqual(new Cube().applyMove('R').state);
  events[2]!.stateAfter.fill(9);
  controller.cube.state.fill(9);
  expect(controller.cube.state).toEqual(new Cube().applyMoves("R U F'").state);
  unsubscribe();
  controller.applyMove('B', 60);
  expect(events).toHaveLength(3);
});

it('rejects disabled input through every move entry point', () => {
  const display = {isAnimating: true, enqueueMove: vi.fn(), enqueueMoves: vi.fn(), setSize: vi.fn(), setState: vi.fn(), dispose: vi.fn()};
  const controller = new CubeController(display);
  const listener = vi.fn(); controller.onMoveApplied(listener);
  controller.lockInput('test');
  expect(controller.applyMove('R', 10)).toBe(false);
  controller.moves(['U'], 11);
  expect(controller.sequence('F', 12)).toBe(0);
  expect(controller.cube.isSolved()).toBe(true);
  expect(controller.lastInput).toBeUndefined();
  expect(listener).not.toHaveBeenCalled();
  expect(display.enqueueMove).not.toHaveBeenCalled();
  expect(display.enqueueMoves).not.toHaveBeenCalled();
  controller.unlockInput('test');
  expect(controller.applyMove('R', 13)).toBe(true);
});

it('rejects invalid moves and timestamps without events or partial state for every N', () => {
  const display = {isAnimating: false, enqueueMove: vi.fn(), enqueueMoves: vi.fn(), setSize: vi.fn(), setState: vi.fn(), dispose: vi.fn()};
  const controller = new CubeController(display);
  const listener = vi.fn(); controller.onMoveApplied(listener);
  for (let n=2; n<=10; n++) {
    controller.setSize(n);
    expect(() => controller.applyMove(`${n+1}R`, 1)).toThrow();
    for (const t of [NaN, Infinity, -1]) expect(() => controller.applyMove('R', t)).toThrow();
    expect(controller.cube.isSolved()).toBe(true);
    expect(controller.lastInput).toBeUndefined();
    controller.moves(['R', 'U', "R'", 'U2'], 20);
    expect(controller.cube.state).toEqual(new Cube(n).applyMoves("R U R' U2").state);
  }
  expect(listener).toHaveBeenCalledTimes(36);
});

it('keeps lock ownership, rejects gated batches atomically and reports replacement',()=>{
 const display={isAnimating:false,enqueueMove:vi.fn(),enqueueMoves:vi.fn(),setSize:vi.fn(),setState:vi.fn(),dispose:vi.fn()};
 const c=new CubeController(display), replaced=vi.fn();c.onStateReplaced(replaced);
 c.lockInput('drag');c.lockInput('context');c.unlockInput('drag');expect(c.inputEnabled).toBe(false);
 (c.lockedBy as Set<string>).clear();expect(c.inputEnabled).toBe(false);c.unlockInput('context');
 c.setMoveGate(m=>m.canonical!=='U');expect(c.applyMove('U',1)).toBe(false);
 expect(c.moves(['R','U'],2)).toBe(false);expect(c.sequence('R U',3)).toBe(0);expect(c.isSolved()).toBe(true);expect(display.enqueueMoves).not.toHaveBeenCalled();
 c.reset();c.scramble('test');c.setSize(7);expect(replaced).toHaveBeenCalledTimes(3);expect(c.size).toBe(7);
 c.dispose();c.unlockInput('disposed');expect(c.inputEnabled).toBe(false);
});

it('rejects multi-move batches under a stateful gate before the solve can end halfway',()=>{
 const display={isAnimating:false,enqueueMove:vi.fn(),enqueueMoves:vi.fn(),setSize:vi.fn(),setState:vi.fn(),dispose:vi.fn()};
 const c=new CubeController(display);c.applyMove('R',1);
 let finished=false;
 c.setMoveGate(()=>!finished);
 const listener=vi.fn(event=>{if(new Cube().state.every((color,i)=>color===event.stateAfter[i])){finished=true;c.lockInput('timer');}});
 c.onMoveApplied(listener);
 const before=c.cube.state;
 expect(c.moves(["R'",'U'],2)).toBe(false);
 expect(c.sequence("R' U",2)).toBe(0);
 expect(c.cube.state).toEqual(before);expect(c.lastInput).toEqual({m:'R',timeStamp:1});
 expect(listener).not.toHaveBeenCalled();expect(display.enqueueMoves).not.toHaveBeenCalled();
 expect(c.moves(["R'"],3)).toBe(true);expect(finished).toBe(true);expect(c.isSolved()).toBe(true);
 expect(c.applyMove('U',4)).toBe(false);expect(listener).toHaveBeenCalledOnce();
 c.unlockInput('timer');c.setMoveGate(undefined);
 expect(c.sequence('R U',5)).toBe(2);expect(c.cube.state).toEqual(new Cube().applyMoves('R U').state);
});
