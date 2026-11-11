import { parseMove } from '@rubik/engine';
import { DEFAULT_KEYMAP } from './keyboard.js';
import type { Keymap } from './keyboard.js';

export interface KeymapSettings {
  version: 1;
  activeProfile: string;
  profiles: Record<string, { bindings: Record<string, string> }>;
}
export const KEYMAP_STORAGE_KEY = 'rubik.keymap.v1';
export function defaultSettings(): KeymapSettings {
  return {version: 1, activeProfile: 'default', profiles: {default: {bindings: {...DEFAULT_KEYMAP}}}};
}
export function isAssignableCode(code: string): boolean {
  // Explicit allowlist excludes system shortcuts, selectors W/digits and modifiers.
  return /^Key[A-VX-Z]$/.test(code) || ['Semicolon','Quote','Comma','Period','Slash','BracketLeft','BracketRight','Backslash','Minus','Equal','Backquote'].includes(code);
}
export function canonicalBinding(move: string): string {
  for (const n of [3, 10]) {
    try { return parseMove(move, n).canonical; } catch { /* Try the other supported size. */ }
  }
  throw new Error('Nước đi không hợp lệ.');
}
function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
export function validProfileName(name: string): boolean {
  return name.trim() === name && name.length > 0 && name.length <= 40 && !['__proto__','constructor','prototype'].includes(name);
}
export function validateSettings(value: unknown): KeymapSettings {
  if (!object(value) || value.version !== 1 || typeof value.activeProfile !== 'string' || !object(value.profiles))
    throw new Error('Cấu hình hoặc phiên bản không được hỗ trợ.');
  const entries = Object.entries(value.profiles);
  if (!entries.length || entries.length > 20) throw new Error('Cần từ 1 đến 20 hồ sơ.');
  const profiles: KeymapSettings['profiles'] = {};
  for (const [name, profile] of entries) {
    if (!validProfileName(name) || !object(profile) || !object(profile.bindings)) throw new Error('Hồ sơ không hợp lệ.');
    const bindings: Record<string, string> = {};
    const counts = new Map<string, number>();
    for (const [code, move] of Object.entries(profile.bindings)) {
      if (!isAssignableCode(code) || typeof move !== 'string' || canonicalBinding(move) !== move) throw new Error('Phím bị khóa hoặc nước đi không chuẩn.');
      counts.set(move, (counts.get(move) ?? 0) + 1);
      if (counts.get(move)! > 2) throw new Error('Mỗi nước chỉ nhận tối đa hai phím.');
      bindings[code] = move;
    }
    if (name === 'default' && (Object.keys(bindings).length !== Object.keys(DEFAULT_KEYMAP).length ||
        Object.entries(DEFAULT_KEYMAP).some(([code, move]) => bindings[code] !== move))) throw new Error('Không được ghi đè hồ sơ mặc định.');
    profiles[name] = {bindings};
  }
  if (!Object.hasOwn(profiles, value.activeProfile)) throw new Error('Không tìm thấy hồ sơ đang chọn.');
  profiles.default ??= {bindings: {...DEFAULT_KEYMAP}};
  if (Object.keys(profiles).length > 20) throw new Error('Tối đa 20 hồ sơ, bao gồm mặc định.');
  return {version: 1, activeProfile: value.activeProfile, profiles};
}
export function importSettings(text: string): KeymapSettings {
  if (text.length > 100_000) throw new Error('Tệp cấu hình quá lớn.');
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new Error('JSON không hợp lệ; cấu hình hiện tại được giữ nguyên.'); }
  return validateSettings(value);
}
export interface KeymapStorage { getItem(key: string): string | null; setItem(key: string, value: string): void }
export function loadSettings(storage: () => KeymapStorage): {settings: KeymapSettings; warning: string} {
  try {
    const text = storage().getItem(KEYMAP_STORAGE_KEY);
    return {settings: text === null ? defaultSettings() : importSettings(text), warning: ''};
  } catch { return {settings: defaultSettings(), warning: 'Không đọc được cấu hình đã lưu; đang dùng mặc định.'}; }
}
export function saveSettings(settings: KeymapSettings, storage: () => KeymapStorage): boolean {
  try { storage().setItem(KEYMAP_STORAGE_KEY, JSON.stringify(validateSettings(settings))); return true; }
  catch { return false; }
}
export interface BindingConflict { source: string | undefined; targetKeys: string[]; needsReplacement: boolean }
export function bindingConflict(bindings: Keymap, code: string, move: string): BindingConflict {
  const targetKeys = Object.keys(bindings).filter(key => key !== code && bindings[key] === move);
  return {source: Object.hasOwn(bindings, code) ? bindings[code] : undefined, targetKeys, needsReplacement: targetKeys.length >= 2};
}
export function assignBinding(bindings: Keymap, code: string, move: string, mode: 'reassign' | 'swap', replaceCode?: string): Record<string, string> {
  if (!isAssignableCode(code) || canonicalBinding(move) !== move) throw new Error('Phím hoặc nước không hợp lệ.');
  const conflict = bindingConflict(bindings, code, move);
  if (replaceCode !== undefined && !conflict.targetKeys.includes(replaceCode)) throw new Error('Chọn phím thuộc nước đích để thay thế.');
  if (conflict.needsReplacement && !replaceCode) throw new Error('Chọn một phím hiện tại để thay thế.');
  if (mode === 'swap' && (!replaceCode || !conflict.source || conflict.source === move)) throw new Error('Chọn hai phím để hoán đổi.');
  const next = {...bindings};
  if (replaceCode) delete next[replaceCode];
  next[code] = move;
  if (mode === 'swap') next[replaceCode!] = conflict.source!;
  return next;
}
