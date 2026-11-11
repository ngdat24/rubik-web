import { describe, expect, it } from 'vitest';
import { stickerGeometry } from '@rubik/engine';
import { buildLayout } from '../src/layout.js';

describe('R1 pure layout N=2..10', () => {
  for (let size = 2; size <= 10; size++) {
    it(`maps every engine sticker and surface cubie for ${size}x${size}`, () => {
      const layout = buildLayout(size);
      expect(layout.slots).toHaveLength(6 * size * size);
      expect(layout.cubies).toHaveLength(size ** 3 - (size - 2) ** 3);
      const unique = new Set<string>();
      const uniqueCubies = new Set<string>();
      for (const [index, slot] of layout.slots.entries()) {
        const engine = stickerGeometry(index, size);
        expect(slot.index).toBe(index);
        expect(slot.normal).toEqual(engine.normal);
        expect(slot.face).toBe(Math.floor(index / (size * size)));
        expect(slot.position.reduce((sum, x, axis) => sum + x * slot.normal[axis]!, 0)).toBeCloseTo(1.5);
        for (let axis = 0; axis < 3; axis++) {
          expect(Math.abs(slot.position[axis]!)).toBeLessThanOrEqual(1.5 + 1e-12);
          expect(slot.position[axis]! - slot.normal[axis]! * layout.cellSize / 2)
            .toBeCloseTo(engine.cubie[axis]! * layout.cellSize / 2);
        }
        unique.add(`${slot.position.join(',')}|${slot.normal.join(',')}`);
      }
      expect(unique.size).toBe(layout.slots.length);
      for (const cubie of layout.cubies) {
        uniqueCubies.add(cubie.coordinates.join(','));
        expect(cubie.coordinates.some(value => Math.abs(value) === size - 1)).toBe(true);
      }
      expect(uniqueCubies.size).toBe(layout.cubies.length);
    });
  }
});

it('matches the hand calculation for top-left R sticker on 3x3', () => {
  // R is face 1: row 0, col 0 gives engine index 9; cubie center is (1,1,1).
  const slot = buildLayout(3).slots[9]!;
  expect(slot).toEqual({ index: 9, face: 1, normal: [1, 0, 0], position: [1.5, 1, 1] });
  expect(stickerGeometry(9, 3).cubie).toEqual([2, 2, 2]);
  expect(buildLayout(3).slots[13]!.position).toEqual([1.5, 0, 0]);
});

it('scales the whole cube and configures borders without moving slots', () => {
  const base = buildLayout(4), large = buildLayout(4, {edgeLength: 6});
  for (const [index, slot] of base.slots.entries()) {
    expect(large.slots[index]!.position).toEqual(slot.position.map(value => value * 2));
  }
  const bordered = buildLayout(4, {gapRatio: 0.1, stickerInsetRatio: 0.15});
  expect(bordered.slots).toEqual(base.slots);
  expect(bordered.cubieSize).toBeCloseTo(0.675);
  expect(bordered.stickerSize).toBeCloseTo(0.45);
});

it('rejects invalid dimensions and does not share mutable positions between layouts', () => {
  for (const size of [1, 11, 2.5, NaN]) expect(() => buildLayout(size)).toThrow();
  for (const options of [{edgeLength: 0}, {edgeLength: Infinity}, {gapRatio: -1}, {gapRatio: 1},
    {stickerInsetRatio: -0.1}, {stickerInsetRatio: NaN}, {gapRatio: 0.5, stickerInsetRatio: 0.25}]) {
    expect(() => buildLayout(3, options)).toThrow();
  }
  const layout = buildLayout(3);
  layout.slots.pop();
  expect(buildLayout(3).slots).toHaveLength(54);
});
