import { expect, it } from 'vitest';
import { Quaternion, Vector3 } from 'three';
import { compileMove, parseMove } from '@rubik/engine';
import { buildLayout, layerSlots, rotationFor } from '../src/layout.js';
import { animationProgress } from '../src/animator.js';

for (let size = 2; size <= 10; size++) {
  it(`R3: rotation of every valid move matches engine permutation for N=${size}`, () => {
    const layout = buildLayout(size);
    const tokens = [...'xyz'];
    for (const face of 'URFDLB') {
      for (let layer = 1; layer <= (size === 2 ? 1 : size); layer++) tokens.push(`${layer}${face}`);
      for (let width = 2; width < size; width++) tokens.push(`${width}${face}w`);
    }
    if (size === 3) tokens.push('M', 'E', 'S');
    for (const token of tokens) for (const suffix of ['', "'", '2']) {
      const move = parseMove(token + suffix, size);
      const permutation = compileMove(move, size);
      const selection = layerSlots(move, size);
      const selected = new Set(selection.stickerIndices);
      const rotation = rotationFor(move);
      // Three.js floating-point rotation is independent of engine's integer permutation math.
      const quaternion = new Quaternion().setFromAxisAngle(new Vector3(...rotation.axis), rotation.angle);
      let maxError = 0;
      for (const slot of layout.slots) {
        const target = layout.slots[permutation[slot.index]!]!;
        const position = new Vector3(...slot.position), normal = new Vector3(...slot.normal);
        if (selected.has(slot.index)) { position.applyQuaternion(quaternion); normal.applyQuaternion(quaternion); }
        maxError = Math.max(maxError, position.distanceTo(new Vector3(...target.position)), normal.distanceTo(new Vector3(...target.normal)));
      }
      expect(maxError, move.canonical).toBeLessThan(1e-10);
      const cubieKeys = new Set(selection.cubieIndices.map(index => layout.cubies[index]!.coordinates.join(',')));
      const stickerCubies = new Set<string>();
      for (const index of selection.stickerIndices) {
        const center = layout.slots[index]!.position.map((value, axis) => Math.round((value - layout.slots[index]!.normal[axis]! * layout.cellSize / 2) * 2 / layout.cellSize));
        expect(cubieKeys.has(center.join(',')), move.canonical).toBe(true);
        stickerCubies.add(center.join(','));
      }
      expect(cubieKeys.size, move.canonical).toBe(stickerCubies.size);
      if (move.type === 'rotation') {
        expect(selected.size).toBe(6 * size * size);
        expect(selection.cubieIndices.length).toBe(layout.cubies.length);
      }
    }
  });
}

it('clamps and eases animation progress at both endpoints', () => {
  expect(animationProgress(-1, 150)).toBe(0);
  expect(animationProgress(0, 150)).toBe(0);
  expect(animationProgress(75, 150)).toBe(0.5);
  expect(animationProgress(150, 150)).toBe(1);
  expect(animationProgress(999, 150)).toBe(1);
});
