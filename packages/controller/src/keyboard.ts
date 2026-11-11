import { parseMove } from '@rubik/engine';
import type { Move } from '@rubik/engine';
import defaults from './default-keymap.json' with { type: 'json' };

export type Keymap = Readonly<Record<string, Move>>;
export const DEFAULT_KEYMAP: Keymap = Object.freeze(defaults);
export interface KeyModifiers { ctrlKey?: boolean; altKey?: boolean; metaKey?: boolean; shiftKey?: boolean }

/** Physical key codes only. Shift is reserved and does not change the move. */
export function resolveKey(code: string, modifiers: KeyModifiers, keymap: Keymap, size: number): Move | null {
  if (modifiers.ctrlKey || modifiers.altKey || modifiers.metaKey) return null;
  if (['Space', 'Escape', 'Tab'].includes(code) || !Object.hasOwn(keymap, code)) return null;
  try { return parseMove(keymap[code]!, size).canonical; } catch { return null; }
}
