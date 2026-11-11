import { expect, it, vi } from 'vitest';
import { Cube, scrambleAt } from '@rubik/engine';
import { DemoController } from '../src/controller.js';

it('uses engine state for scramble/reset and reuses the same display for every N', () => {
  let shown = new Uint8Array();
  const display = { isAnimating: false, enqueueMove: vi.fn(), setSize: vi.fn(), setState: vi.fn((state: Uint8Array) => {shown = state.slice();}), dispose: vi.fn() };
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
  const display = { isAnimating: false, enqueueMove: vi.fn(), setSize: vi.fn(), setState: vi.fn(), dispose: vi.fn() };
  const controller = new DemoController(display);
  const before = controller.cube;
  expect(() => controller.setSize(11)).toThrow();
  expect(controller.cube).toBe(before);
  expect(display.setSize).toHaveBeenCalledTimes(1);
});

it('applies and timestamps input before animation, rejects overlap and rolls back a rejected enqueue', () => {
  const display = { isAnimating: false, enqueueMove: vi.fn(), setSize: vi.fn(), setState: vi.fn(), dispose: vi.fn() };
  const controller = new DemoController(display);
  display.enqueueMove.mockImplementation((move, state) => {
    expect(controller.lastInput).toEqual({m: 'R', timeStamp: 42.75});
    expect(controller.cube.state).toEqual(state);
    expect(move).toBe('R');
  });
  expect(controller.move('R', 42.75)).toBe(true);
  expect(controller.cube.state).toEqual(new Cube().applyMoves('R').state);
  display.isAnimating = true;
  expect(controller.move('U', 50)).toBe(false);
  expect(controller.lastInput!.timeStamp).toBe(42.75);
  display.isAnimating = false;
  display.enqueueMove.mockImplementation(() => {throw new Error('display failed');});
  expect(() => controller.move('U', 60)).toThrow('display failed');
  expect(controller.cube.state).toEqual(new Cube().applyMoves('R').state);
  expect(controller.lastInput).toEqual({m: 'R', timeStamp: 42.75});
  controller.reset();
  expect(controller.lastInput).toBeUndefined();
});
