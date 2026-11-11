import { afterEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ render: vi.fn(), request: vi.fn(() => 7) }));
vi.mock('three', async original => ({...await original<typeof import('three')>(), WebGLRenderer: class {
  domElement = {remove: vi.fn(), setAttribute: vi.fn()};
  outputColorSpace = ''; setPixelRatio = vi.fn(); setSize = vi.fn(); render = mocks.render;
  dispose = vi.fn(); forceContextLoss = vi.fn();
}}));
vi.mock('three/addons/controls/OrbitControls.js', () => ({OrbitControls: class {
  target = {set: vi.fn()}; update = vi.fn(); dispose = vi.fn();
}}));
import { Group, Mesh, ShapeGeometry, MeshStandardMaterial } from 'three';
import { Cube } from '@rubik/engine';
import { CubeRenderer } from '../src/index.js';
import { WESTERN_COLORS } from '../src/colors.js';

function setup() {
  vi.stubGlobal('window', {devicePixelRatio: 1, addEventListener: vi.fn(), removeEventListener: vi.fn()});
  vi.stubGlobal('requestAnimationFrame', mocks.request); vi.stubGlobal('cancelAnimationFrame', vi.fn());
  vi.stubGlobal('ResizeObserver', class {observe = vi.fn(); disconnect = vi.fn();});
  const renderer = new CubeRenderer({clientWidth: 800, clientHeight: 500, append: vi.fn()} as unknown as HTMLElement);
  const draw = mocks.request.mock.calls[0]![0] as unknown as (t: number) => void;
  draw(0);
  const group = mocks.render.mock.calls[0]![0].children.find((child: unknown) => child instanceof Group) as Group;
  const stickers = group.children.filter(child => (child as Mesh).geometry instanceof ShapeGeometry) as Mesh<ShapeGeometry, MeshStandardMaterial>[];
  return {renderer, draw, group, colors: () => stickers.map(s => s.material.color.getHex())};
}
afterEach(() => {vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.clearAllMocks();});

it('keeps rapid inputs and snapshots in order, speeds up and reports idle once', () => {
  const {renderer, draw, group, colors} = setup();
  const moves = Array.from({length: 60}, (_, i) => ['R','R','U',"R'",'U2','x'][i % 6]!);
  const cube = new Cube();
  const expected = moves.map(move => {cube.applyMove(move); return [...cube.state].map(c => WESTERN_COLORS[c]);});
  const received: string[] = [];
  const idle = vi.fn(); renderer.onIdle = idle;
  renderer.onMoveAnimated = move => {received.push(move); expect(colors()).toEqual(expected[received.length - 1]);};
  const input = new Cube();
  for (const move of moves) {input.applyMove(move); renderer.enqueueMove(move, input.state);}
  input.state.fill(5);
  expect(renderer.pendingMoveCount).toBe(60);
  draw(100); draw(110);
  expect(received).toHaveLength(1);
  for (let t = 130; t < 10000 && renderer.pendingMoveCount; t += 20) draw(t);
  expect(received).toEqual(moves); expect(renderer.pendingMoveCount).toBe(0);
  expect(idle).toHaveBeenCalledOnce(); draw(20000); expect(idle).toHaveBeenCalledOnce();
  expect(group.children).toHaveLength(26 + 54);
  renderer.dispose();
});

it('validates batches atomically, clears to final state and supports reset/instant/resize/dispose', () => {
  const {renderer, draw, colors} = setup();
  const batch = ['R','R','U2'].map((move, i) => ({move, stateAfter: new Cube().applyMoves(['R','R','U2'].slice(0, i + 1)).state}));
  const animated = vi.fn(), idle = vi.fn(); renderer.onMoveAnimated = animated; renderer.onIdle = idle;
  expect(() => renderer.enqueueMoves([...batch, {move: 'invalid', stateAfter: new Cube().state}])).toThrow();
  expect(renderer.pendingMoveCount).toBe(0);
  renderer.enqueueMoves(batch); draw(0); draw(20); renderer.clearQueue();
  expect(colors()).toEqual([...batch[2]!.stateAfter].map(c => WESTERN_COLORS[c]));
  expect(animated).not.toHaveBeenCalled(); expect(idle).toHaveBeenCalledOnce();
  renderer.clearQueue(); expect(idle).toHaveBeenCalledOnce();
  renderer.enqueueMoves(batch); renderer.setState(new Cube().state); draw(1000);
  expect(animated).not.toHaveBeenCalled();
  expect(colors()).toEqual([...new Cube().state].map(c => WESTERN_COLORS[c]));
  renderer.enqueueMoves(batch); renderer.setInstant(true); draw(1001);
  expect(animated.mock.calls.map(call => call[0])).toEqual(['R','R','U2']);
  expect(renderer.pendingMoveCount).toBe(0); expect(idle).toHaveBeenCalledTimes(3);
  renderer.enqueueMoves(batch); renderer.setSize(4); draw(2000);
  expect(renderer.pendingMoveCount).toBe(0); expect(animated).toHaveBeenCalledTimes(3);
  renderer.enqueueMove('Rw', new Cube(4).applyMove('Rw').state); renderer.dispose(); draw(3000);
  expect(animated).toHaveBeenCalledTimes(3);
});

it('handles backwards first-frame timestamps and speed changes without rewinding', () => {
  vi.spyOn(performance, 'now').mockReturnValue(1000);
  const {renderer, draw, group} = setup();
  renderer.enqueueMove('R', new Cube().applyMove('R').state);
  const pivot = group.children.find(child => child instanceof Group)!;
  draw(100); expect(pivot.rotation.x).toBeCloseTo(0);
  draw(90); expect(pivot.rotation.x).toBeCloseTo(0);
  draw(140); const before = pivot.rotation.x;
  renderer.setSpeed(500); draw(150); expect(pivot.rotation.x).toBeLessThan(before);
  expect(() => renderer.setSpeed(0)).toThrow(); expect(() => renderer.setSpeed(NaN)).toThrow();
  renderer.setSpeed(30); draw(200); expect(renderer.isAnimating).toBe(false);
  renderer.dispose();
});
