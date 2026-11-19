import {solvedState} from '@rubik/engine';
import {CubeRenderer} from '@rubik/renderer';
import type {CubeSurface} from '@rubik/renderer';
import {skinLayout, skinPalette, skinSurface} from './skin-effects.js';
import type {Appearance} from './skin-effects.js';

const toggle = document.querySelector<HTMLInputElement>('#new-light')!;
const mounted: {renderer: CubeRenderer; surface: CubeSurface}[] = [];
const abort = new AbortController();

function lighting(surface: CubeSurface): CubeSurface {
  if (toggle.checked) return surface;
  const previous = {...surface};
  delete previous.ambientLightIntensity;
  return previous;
}

toggle.addEventListener('change', () => {
  for (const {renderer, surface} of mounted) renderer.setSurface(lighting(surface));
});

async function mount(stage: HTMLElement): Promise<void> {
  try {
    const response = await fetch('/api/skin-appearance?id=' + encodeURIComponent(stage.dataset.skinId!), {
      signal: AbortSignal.any([abort.signal, AbortSignal.timeout(10000)]),
    });
    if (!response.ok) throw new Error('Skin appearance unavailable');
    const {appearance} = await response.json() as {appearance: Appearance};
    const surface = skinSurface(appearance);
    if (!surface || abort.signal.aborted) return;
    const renderer = new CubeRenderer(stage, {
      size: 3, optimize: true, ...skinLayout(appearance), theme: skinPalette(appearance), surface: lighting(surface),
    });
    renderer.setState(solvedState(3));
    mounted.push({renderer, surface});
    stage.querySelector('p')!.remove();
  } catch {
    if (!abort.signal.aborted) stage.querySelector('p')!.textContent = 'Không tải được mẫu Rubik.';
  }
}

function dispose() {
  abort.abort();
  for (const {renderer} of mounted.splice(0)) renderer.dispose();
}

window.addEventListener('pagehide', event => { if (!event.persisted) dispose(); });
if (import.meta.hot) import.meta.hot.dispose(dispose);
for (const stage of document.querySelectorAll<HTMLElement>('[data-skin-id]')) void mount(stage);
