import { parseMove } from '@rubik/engine';
import type { Move } from '@rubik/engine';
import defaults from './default-keymap.json' with { type: 'json' };

export type Keymap = Readonly<Record<string, Move>>;
export const DEFAULT_KEYMAP: Keymap = Object.freeze(defaults);
export interface KeyModifiers {
  ctrlKey?: boolean; altKey?: boolean; metaKey?: boolean; shiftKey?: boolean;
  wide?: boolean; layer?: number;
}

/** Pure physical-key resolution; parser remains authoritative for legal layers. */
export function resolveKey(code: string, modifiers: KeyModifiers, keymap: Keymap, size: number): Move | null {
  if (modifiers.ctrlKey || modifiers.metaKey) return null; // Includes AltGr (Ctrl+Alt).
  if (['Space', 'Escape', 'Tab', 'KeyW'].includes(code) || !Object.hasOwn(keymap, code)) return null;
  try {
    const base = parseMove(keymap[code]!, size);
    let move = base.canonical;
    if (modifiers.layer !== undefined || modifiers.wide) {
      if (base.type !== 'face' || base.layerStart !== base.layerEnd || !/^[URFDLB]$/.test(move)) return null;
      const layer = modifiers.layer ?? (modifiers.wide ? 2 : 1);
      if (!Number.isInteger(layer) || layer < (modifiers.wide ? 2 : 1)) return null;
      move = `${layer === 1 || (modifiers.wide && layer === 2) ? '' : layer}${move}${modifiers.wide ? 'w' : ''}`;
    }
    // Alt always means 180 degrees, including Shift+Alt. Shift toggles a quarter turn.
    if (modifiers.altKey) move = move.replace(/['2]$/, '') + '2';
    else if (modifiers.shiftKey && !move.endsWith('2')) move = move.endsWith("'") ? move.slice(0,-1) : move + "'";
    return parseMove(move, size).canonical;
  } catch { return null; }
}
