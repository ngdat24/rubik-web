import { expect, it, vi } from 'vitest';
import { Cube, scrambleAt } from '@rubik/engine';
import { DemoController } from '../src/controller.js';

it('uses engine state for scramble/reset and reuses the same display for every N', () => {
  let shown = new Uint8Array();
  const display = { isAnimating: false, enqueueMove: vi.fn(), enqueueMoves: vi.fn(), setSize: vi.fn(), setState: vi.fn((state: Uint8Array) => {shown = state.slice();}), dispose: vi.fn() };
  const controller = new DemoController(display);
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
  const controller = new DemoController(display);
  const before = controller.cube;
  expect(() => controller.setSize(11)).toThrow();
  expect(controller.cube).toBe(before);
  expect(display.setSize).toHaveBeenCalledTimes(1);
});

it('accepts and timestamps input while animation is busy and rolls back a rejected enqueue', () => {
  const display = { isAnimating: false, enqueueMove: vi.fn(), enqueueMoves: vi.fn(), setSize: vi.fn(), setState: vi.fn(), dispose: vi.fn() };
  const controller = new DemoController(display);
  display.enqueueMove.mockImplementationOnce((move, state) => {
    expect(controller.lastInput).toEqual({m: 'R', timeStamp: 42.75});
    expect(controller.cube.state).toEqual(state);
    expect(move).toBe('R');
  });
  expect(controller.move('R', 42.75)).toBe(true);
  expect(controller.cube.state).toEqual(new Cube().applyMoves('R').state);
  display.isAnimating = true;
  expect(controller.move('U', 50)).toBe(true);
  expect(controller.cube.state).toEqual(new Cube().applyMoves('R U').state);
  expect(controller.lastInput!.timeStamp).toBe(50);
  display.isAnimating = false;
  display.enqueueMove.mockImplementation(() => {throw new Error('display failed');});
  expect(() => controller.move('F', 60)).toThrow('display failed');
  expect(controller.cube.state).toEqual(new Cube().applyMoves('R U').state);
  expect(controller.lastInput).toEqual({m: 'U', timeStamp: 50});
  controller.reset();
  expect(controller.lastInput).toBeUndefined();
});

it('applies whole batches immediately with independent snapshots and atomic validation', () => {
  const display = { isAnimating: true, enqueueMove: vi.fn(), enqueueMoves: vi.fn(), setSize: vi.fn(), setState: vi.fn(), dispose: vi.fn() };
  const controller = new DemoController(display);
  controller.moves(['R','R','U2'], 100);
  expect(controller.cube.state).toEqual(new Cube().applyMoves('R R U2').state);
  const snapshots = display.enqueueMoves.mock.calls[0]![0];
  expect(snapshots.map(item => item.move)).toEqual(['R','R','U2']);
  expect(snapshots[0].stateAfter).toEqual(new Cube().applyMove('R').state);
  expect(snapshots[1].stateAfter).toEqual(new Cube().applyMove('R2').state);
  expect(snapshots[0].stateAfter).not.toBe(snapshots[1].stateAfter);
  const before = controller.cube;
  expect(() => controller.moves(['R','bad'], 110)).toThrow();
  expect(controller.cube).toBe(before);
  display.enqueueMoves.mockImplementation(() => {throw new Error('display failed');});
  expect(() => controller.moves(['F','B'], 120)).toThrow();
  expect(controller.cube).toBe(before);
  expect(controller.lastInput).toEqual({m: 'U2', timeStamp: 100});
});

it('parses complete sequences before accepting any moves', () => {
  const display = {isAnimating: false, enqueueMove: vi.fn(), enqueueMoves: vi.fn(), setSize: vi.fn(), setState: vi.fn(), dispose: vi.fn()};
  const controller = new DemoController(display);
  expect(controller.sequence("r U2 R2'", 12)).toBe(3);
  expect(controller.cube.state).toEqual(new Cube().applyMoves('Rw U2 R2').state);
  const before = controller.cube;
  expect(() => controller.sequence('R invalid', 13)).toThrow();
  expect(controller.cube).toBe(before);
  expect(() => controller.sequence('R '.repeat(2001), 14)).toThrow('2000');
  expect(controller.cube).toBe(before);
});
