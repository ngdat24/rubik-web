import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  remove: vi.fn(), append: vi.fn(), attribute: vi.fn(), render: vi.fn(), size: vi.fn(), ratio: vi.fn(),
  dispose: vi.fn(), controlsDispose: vi.fn(), update: vi.fn(), observe: vi.fn(), disconnect: vi.fn(),
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
  } };
});
vi.mock('three/addons/controls/OrbitControls.js', () => ({ OrbitControls: class {
  enabled = true; enablePan = true; enableDamping = false; minDistance = 0; maxDistance = 0;
  target = { set: vi.fn() }; dispose = mocks.controlsDispose; update = mocks.update;
  constructor() { mocks.controls = this; }
} }));
import { BoxGeometry, MeshStandardMaterial } from 'three';
import { CubeRenderer } from '../src/index.js';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe('R0 renderer lifetime without a GPU', () => {
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
    container.clientWidth = 0; container.clientHeight = 0;
    resize!();
    expect(mocks.size).toHaveBeenLastCalledWith(1, 1, false);
    renderer.dispose(); renderer.dispose();
    expect(mocks.cancel).toHaveBeenCalledWith(7);
    expect(mocks.disconnect).toHaveBeenCalledOnce();
    expect(mocks.controlsDispose).toHaveBeenCalledOnce();
    expect(mocks.dispose).toHaveBeenCalledOnce();
    expect(mocks.remove).toHaveBeenCalledOnce();
    expect(geometryDispose).toHaveBeenCalledOnce();
    expect(materialDispose).toHaveBeenCalledTimes(6);
    expect(mocks.removeListener).toHaveBeenCalledWith('resize', mocks.add.mock.calls[0]![1]);
    draw(); resize!();
    expect(mocks.render).toHaveBeenCalledOnce();
  });
});
