import { DEFAULT_KEYMAP, resolveKey } from '@rubik/controller';
import type { CubeController } from '@rubik/controller';

function isEditing(event: KeyboardEvent): boolean {
  return event.composedPath().some(target => target instanceof HTMLElement &&
    (target.matches('input, textarea, select, [role="textbox"]') || target.isContentEditable));
}

/** Timestamp comes directly from keydown; no animation callback participates. */
export function attachKeyboard(controller: CubeController, onMove: (move: string) => void): () => void {
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.defaultPrevented || event.repeat || event.isComposing || isEditing(event) ||
        !controller.inputEnabled || document.querySelector('dialog[open], [aria-modal="true"]') ||
        event.ctrlKey || event.altKey || event.metaKey) return;
    if (event.code === 'Space') {
      if (!(event.target instanceof Element && event.target.closest('button, a[href], [role="button"]'))) event.preventDefault();
      return;
    }
    const move = resolveKey(event.code, event, DEFAULT_KEYMAP, controller.cube.size);
    if (!move) return;
    event.preventDefault();
    if (controller.applyMove(move, event.timeStamp)) onMove(move);
  };
  window.addEventListener('keydown', onKeyDown);
  return () => window.removeEventListener('keydown', onKeyDown);
}
