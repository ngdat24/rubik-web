import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  remove: vi.fn(), append: vi.fn(), attribute: vi.fn(), render: vi.fn(), size: vi.fn(), ratio: vi.fn(),
  dispose: vi.fn(), contextLoss: vi.fn(), controlsDispose: vi.fn(), update: vi.fn(), observe: vi.fn(), disconnect: vi.fn(),
  request: vi.fn(() => 7), cancel: vi.fn(), add: vi.fn(), removeListener: vi.fn(),
  controls: undefined as { enabled: boolean } | undefined,
}));

vi.mock('three', async importOriginal => {
  const original = await importOriginal<typeof import('three')>();
  return { ...original, WebGLRenderer: class {
    domElement = { remove: mocks.remove, setAttribute: mocks.attribute };
    outputColorSpace = '';
    setPixelRatio = mocks.ratio;
    setSize = mocks.size;
    render = mocks.render;
    dispose = mocks.dispose;
    forceContextLoss = mocks.contextLoss;
  } };
});
vi.mock('three/addons/controls/OrbitControls.js', () => ({ OrbitControls: class {
  enabled = true; enablePan = true; enableDamping = false; minDistance = 0; maxDistance = 0;
  target = { set: vi.fn() }; dispose = mocks.controlsDispose; update = mocks.update; reset = vi.fn();
  constructor() { mocks.controls = this; }
} }));
import { BoxGeometry, MeshStandardMaterial, ShapeGeometry, Group, Mesh, Vector3 } from 'three';
import { CubeRenderer } from '../src/index.js';
import { Cube } from '@rubik/engine';
import { WESTERN_COLORS } from '../src/colors.js';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe('R0 renderer lifetime without a GPU', () => {
  it('animates one layer, paints the copied snapshot and cancels safely', () => {
    vi.stubGlobal('window', { devicePixelRatio: 1, addEventListener: mocks.add, removeEventListener: mocks.removeListener });
    vi.stubGlobal('requestAnimationFrame', mocks.request);
    vi.stubGlobal('cancelAnimationFrame', mocks.cancel);
    vi.stubGlobal('ResizeObserver', class { observe = mocks.observe; disconnect = mocks.disconnect; });
    vi.spyOn(performance, 'now').mockReturnValue(0);
    const renderer = new CubeRenderer({clientWidth: 800, clientHeight: 500, append: mocks.append} as unknown as HTMLElement);
    const callback = vi.fn(); renderer.onMoveAnimated = callback;
    const draw = mocks.request.mock.calls[0]![0] as unknown as (time: number) => void;
    draw(0);
    const scene = mocks.render.mock.calls[0]![0];
    const group = scene.children.find((child: unknown) => child instanceof Group) as Group;
    const meshes = [...group.children] as Mesh<ShapeGeometry, MeshStandardMaterial>[];
    const transforms = meshes.map(mesh => ({position: mesh.position.clone(), quaternion: mesh.quaternion.clone()}));
    const after = new Cube().applyMoves('R').state;
    const expectedColors = [...after].map(color => WESTERN_COLORS[color]);
    renderer.enqueueMove('R', after);
    after.fill(5);
    expect(renderer.isAnimating).toBe(true);
    const pivot = group.children.find(child => child instanceof Group)!;
    expect(pivot.children).toHaveLength(9 + 21);
    draw(0);
    draw(75);
    expect(pivot.rotation.x).toBeCloseTo(-Math.PI / 4);
    expect(callback).not.toHaveBeenCalled();
    draw(150);
    expect(renderer.isAnimating).toBe(false);
    expect(callback).toHaveBeenCalledWith('R');
    const stickers = meshes.filter(mesh => mesh.geometry instanceof ShapeGeometry);
    expect(stickers.map(mesh => mesh.material.color.getHex())).toEqual(expectedColors);
    for (const [index, mesh] of meshes.entries()) {
      expect(mesh.parent).toBe(group);
      expect(mesh.position).toEqual(transforms[index]!.position);
      expect(mesh.quaternion.toArray()).toEqual(transforms[index]!.quaternion.toArray());
    }
    callback.mockClear();
    renderer.enqueueMove('U2', new Cube().applyMoves('R U2').state);
    draw(0);
    draw(150);
    expect(renderer.isAnimating).toBe(true); // doubles take 225ms
    renderer.setState(new Cube().state);
    draw(999);
    expect(renderer.isAnimating).toBe(false);
    expect(callback).not.toHaveBeenCalled();
    expect(stickers.map(mesh => mesh.material.color.getHex())).toEqual([...new Cube().state].map(c => WESTERN_COLORS[c]));
    renderer.enqueueMove('x', new Cube().applyMoves('x').state);
    expect(group.children.find(child => child instanceof Group)!.children).toHaveLength(meshes.length);
    renderer.setSize(4);
    expect(renderer.isAnimating).toBe(false);
    renderer.enqueueMove('Rw', new Cube(4).applyMoves('Rw').state);
    renderer.dispose();
    draw(1000);
    expect(callback).not.toHaveBeenCalled();
  });
  it('paints without allocating materials, switches theme and reuses the canvas while resizing', () => {
    vi.stubGlobal('window', { devicePixelRatio: 1, addEventListener: mocks.add, removeEventListener: mocks.removeListener });
    vi.stubGlobal('requestAnimationFrame', mocks.request);
    vi.stubGlobal('cancelAnimationFrame', mocks.cancel);
    vi.stubGlobal('ResizeObserver', class { observe = mocks.observe; disconnect = mocks.disconnect; });
    const geometryDispose = vi.spyOn(BoxGeometry.prototype, 'dispose');
    const materialDispose = vi.spyOn(MeshStandardMaterial.prototype, 'dispose');
    const renderer = new CubeRenderer({clientWidth: 800, clientHeight: 500, append: mocks.append} as unknown as HTMLElement);
    const draw = mocks.request.mock.calls[0]![0] as unknown as () => void;
    draw();
    const scene = mocks.render.mock.calls[0]![0];
    const camera = mocks.render.mock.calls[0]![1];
    renderer.setCameraView('dbl');
    expect(camera.position.toArray()).toEqual([-6,-5,-7]);
    renderer.resetCamera();
    expect(camera.position.toArray()).toEqual([6,5,7]);
    const group = scene.children.find((child: unknown) => child instanceof Group) as Group;
    const getStickers = () => group.children.filter(child => (child as Mesh).geometry instanceof ShapeGeometry) as Mesh<ShapeGeometry, MeshStandardMaterial>[];
    const palette = [...new Set(getStickers().map(sticker => sticker.material))];
    const state = new Cube().applyMoves('R U').state;
    renderer.setState(state);
    expect(getStickers().map(s => s.material.color.getHex())).toEqual([...state].map(color => WESTERN_COLORS[color]));
    expect(getStickers().every(s => palette.includes(s.material))).toBe(true);
    const painted = getStickers().map(s => s.material);
    state.fill(5);
    expect(getStickers().map(s => s.material)).toEqual(painted); // no retained state reference
    const invalid = new Cube().state;
    invalid[53] = 255;
    expect(() => renderer.setState(invalid)).toThrow();
    expect(getStickers().map(s => s.material)).toEqual(painted);
    renderer.setTheme([0,1,2,3,4,5]);
    expect(getStickers().every(s => palette.includes(s.material))).toBe(true);
    expect(getStickers().map(s => s.material.color.getHex())).toEqual([...new Cube().applyMoves('R U').state]);
    expect(() => renderer.setSize(11)).toThrow();
    expect(group.children).toHaveLength(26 + 54);
    for (let size = 2; size <= 10; size++) {
      renderer.setSize(size);
      renderer.setState(new Cube(size).state);
      expect(getStickers()).toHaveLength(6 * size * size);
      expect(group.children).toHaveLength(size ** 3 - (size - 2) ** 3 + 6 * size * size);
      expect(getStickers().map(s => s.material.color.getHex())).toEqual([...new Cube(size).state]);
    }
    expect(geometryDispose).toHaveBeenCalledTimes(9);
    expect(materialDispose).toHaveBeenCalledTimes(9 * 7);
    expect(mocks.append).toHaveBeenCalledOnce();
    expect(mocks.controlsDispose).not.toHaveBeenCalled();
    expect(mocks.contextLoss).not.toHaveBeenCalled();
    draw();
    expect(mocks.render.mock.calls.at(-1)![1]).toBe(camera);
    renderer.dispose();
    expect(() => renderer.setState(new Cube(10).state)).toThrow('disposed');
  });
  it('sizes the canvas, limits DPR, toggles orbit, releases resources and stops frames', () => {
    let resize: (() => void) | undefined;
    vi.stubGlobal('window', { devicePixelRatio: 3, addEventListener: mocks.add, removeEventListener: mocks.removeListener });
    vi.stubGlobal('requestAnimationFrame', mocks.request);
    vi.stubGlobal('cancelAnimationFrame', mocks.cancel);
    vi.stubGlobal('ResizeObserver', class {
      observe = mocks.observe; disconnect = mocks.disconnect;
      constructor(callback: () => void) { resize = callback; }
    });
    const geometryDispose = vi.spyOn(BoxGeometry.prototype, 'dispose');
    const stickerDispose = vi.spyOn(ShapeGeometry.prototype, 'dispose');
    const materialDispose = vi.spyOn(MeshStandardMaterial.prototype, 'dispose');
    const container = {clientWidth: 800, clientHeight: 500, append: mocks.append};
    const renderer = new CubeRenderer(container as unknown as HTMLElement);
    expect(mocks.size).toHaveBeenCalledWith(800, 500, false);
    expect(mocks.ratio).toHaveBeenCalledWith(2);
    expect(mocks.observe).toHaveBeenCalledWith(container);
    renderer.enableOrbit(false);
    expect(mocks.controls!.enabled).toBe(false);
    const draw = mocks.request.mock.calls[0]![0] as unknown as () => void;
    draw();
    expect(mocks.render).toHaveBeenCalledOnce();
    const scene = mocks.render.mock.calls[0]![0];
    const group = scene.children.find((child: unknown) => child instanceof Group) as Group;
    expect(group.children).toHaveLength(26 + 54);
    const stickers = group.children.filter(child => (child as Mesh).geometry instanceof ShapeGeometry) as Mesh[];
    expect(stickers).toHaveLength(54);
    // PlaneGeometry/ShapeGeometry faces local +Z; the top-left R sticker must face +X.
    const direction = new Vector3(0, 0, 1).applyQuaternion(stickers[9]!.quaternion);
    expect(direction.x).toBeCloseTo(1);
    expect(direction.y).toBeCloseTo(0);
    expect(direction.z).toBeCloseTo(0);
    expect(stickers[9]!.position.x).toBeGreaterThan(1.5);
    container.clientWidth = 0; container.clientHeight = 0;
    resize!();
    expect(mocks.size).toHaveBeenLastCalledWith(1, 1, false);
    renderer.dispose(); renderer.dispose();
    expect(mocks.cancel).toHaveBeenCalledWith(7);
    expect(mocks.disconnect).toHaveBeenCalledOnce();
    expect(mocks.controlsDispose).toHaveBeenCalledOnce();
    expect(mocks.dispose).toHaveBeenCalledOnce();
    expect(mocks.contextLoss).toHaveBeenCalledOnce();
    expect(mocks.remove).toHaveBeenCalledOnce();
    expect(geometryDispose).toHaveBeenCalledOnce();
    expect(stickerDispose).toHaveBeenCalledOnce();
    expect(materialDispose).toHaveBeenCalledTimes(7);
    expect(mocks.removeListener).toHaveBeenCalledWith('resize', mocks.add.mock.calls[0]![1]);
    draw(); resize!();
    expect(mocks.render).toHaveBeenCalledOnce();
  });
});
