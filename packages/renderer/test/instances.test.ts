import { expect, it } from 'vitest';
import { BoxGeometry, Group, MeshStandardMaterial, Matrix4, Quaternion, Shape, ShapeGeometry, Vector3 } from 'three';
import { parseMove } from '@rubik/engine';
import { buildLayout, layerSlots, rotationFor } from '../src/layout.js';
import { InstancedCube } from '../src/instanced-cube.js';
import { WESTERN_COLORS } from '../src/colors.js';

it('instance matrices follow selected slots and restore exactly without drift', () => {
  const layout = buildLayout(10), group = new Group();
  const body = new BoxGeometry(), sticker = new ShapeGeometry(new Shape()), material = new MeshStandardMaterial();
  const view = new InstancedCube(group, layout, body, sticker, material, WESTERN_COLORS);
  const base = new Matrix4(), current = new Matrix4(), expected = new Matrix4();
  const move = parseMove('3Rw', 10), selection = layerSlots(move, 10), rotation = rotationFor(move);
  const quaternion = new Quaternion().setFromAxisAngle(new Vector3(...rotation.axis), rotation.angle / 2);
  const turn = new Matrix4().makeRotationFromQuaternion(quaternion);
  for (const index of [0, 55, 99, 150, 220, 350, 599]) {
    view.stickers.getMatrixAt(index, base);
    view.begin(selection); view.rotate(quaternion);
    view.stickers.getMatrixAt(index, current);
    expected.copy(base);
    if (selection.stickerIndices.includes(index)) expected.premultiply(turn);
    expect(Math.max(...current.elements.map((v, axis) => Math.abs(v - expected.elements[axis]!)))).toBeLessThan(1e-6);
    view.end(); view.stickers.getMatrixAt(index, current);
    expect(current.elements).toEqual(base.elements);
  }
  expect(view.bodies.count).toBe(488); expect(view.stickers.count).toBe(600);
  view.dispose(); body.dispose(); sticker.dispose(); material.dispose();
});
