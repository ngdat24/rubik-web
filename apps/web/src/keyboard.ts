import { DEFAULT_KEYMAP, resolveKey } from '@rubik/controller';
import type { CubeController } from '@rubik/controller';

function isEditing(event: Event): boolean {
  return event.composedPath().some(target => target instanceof HTMLElement &&
    (target.matches('input, textarea, select, [role="textbox"]') || target.isContentEditable));
}

/** Timestamp is the face-key keydown, never the earlier selector or the animation. */
export function attachKeyboard(controller: CubeController, onMove: (move: string) => void): () => void {
  const held = new Set<string>();
  const clear = (): void => { held.clear(); };
  const onFocus = (event: FocusEvent): void => { if (isEditing(event)) clear(); };
  const onKeyUp = (event: KeyboardEvent): void => { held.delete(event.code); };
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.isComposing || isEditing(event) || !controller.inputEnabled ||
        document.querySelector('dialog[open], [aria-modal="true"]') || event.ctrlKey || event.metaKey) { clear(); return; }
    if (event.defaultPrevented || event.repeat) return;
    if (event.code === 'KeyW' || /^Digit[0-9]$/.test(event.code)) {
      held.add(event.code); event.preventDefault(); return;
    }
    if (event.code === 'Space') {
      if (!(event.target instanceof Element && event.target.closest('button, a[href], [role="button"]'))) event.preventDefault();
      return;
    }
    const digits = [...held].filter(code => code.startsWith('Digit'));
    if (digits.length > 1) return; // Ambiguous selection never guesses a layer.
    const layer = digits[0] ? Number(digits[0].slice(5)) || 10 : undefined;
    const move = resolveKey(event.code, {ctrlKey:event.ctrlKey, metaKey:event.metaKey,
      shiftKey:event.shiftKey, altKey:event.altKey, wide:held.has('KeyW'),
      ...(layer === undefined ? {} : {layer})}, DEFAULT_KEYMAP, controller.cube.size);
    if (!move) return;
    event.preventDefault();
    if (controller.applyMove(move, event.timeStamp)) onMove(move);
  };
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', clear);
  window.addEventListener('focusin', onFocus);
  document.addEventListener('visibilitychange', clear);
  return () => {
    clear();
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('blur', clear);
    window.removeEventListener('focusin', onFocus);
    document.removeEventListener('visibilitychange', clear);
  };
}
