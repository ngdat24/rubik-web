import { expect, it } from 'vitest';
import { DEFAULT_KEYMAP, resolveKey } from '../src/keyboard.js';

it('matches every spec 06 binding for every cube size', () => {
  const pairs = [['KeyI','R'],['KeyK',"R'"],['KeyJ','U'],['KeyF',"U'"],['KeyH','F'],['KeyG',"F'"],['KeyD','L'],['KeyE',"L'"],['KeyS','D'],['KeyL',"D'"],['KeyW','B'],['KeyO',"B'"],['Semicolon','y'],['KeyA',"y'"],['KeyT','x'],['KeyN',"x'"],['KeyP','z'],['KeyQ',"z'"]];
  expect(Object.entries(DEFAULT_KEYMAP)).toEqual(pairs);
  for (let n=2; n<=10; n++) for (const [code, move] of pairs) {
    expect(resolveKey(code!, {}, DEFAULT_KEYMAP, n)).toBe(move);
    expect(resolveKey(code!, {shiftKey:true}, DEFAULT_KEYMAP, n)).toBe(move);
  }
});

it('ignores browser modifiers, reserved and unassigned keys', () => {
  for (const modifiers of [{ctrlKey:true},{altKey:true},{metaKey:true}])
    expect(resolveKey('KeyI', modifiers, DEFAULT_KEYMAP, 3)).toBeNull();
  for (const code of ['Space','Escape','Tab','KeyZ','toString','__proto__'])
    expect(resolveKey(code, {}, DEFAULT_KEYMAP, 3)).toBeNull();
  for (const code of ['Space','Escape','Tab'])
    expect(resolveKey(code, {}, {[code]:'R'}, 3)).toBeNull();
});

it('validates data keymaps using the engine without changing them', () => {
  const map = {KeyM:'M', KeyR:'3R', KeyW:'3Rw', KeyB:'bad'};
  const before = JSON.stringify(map);
  expect(resolveKey('KeyM', {}, map, 3)).toBe('M');
  expect(resolveKey('KeyM', {}, map, 7)).toBeNull();
  expect(resolveKey('KeyR', {}, map, 2)).toBeNull();
  expect(resolveKey('KeyW', {}, map, 3)).toBeNull();
  expect(resolveKey('KeyW', {}, map, 7)).toBe('3Rw');
  expect(resolveKey('KeyB', {}, map, 3)).toBeNull();
  expect(resolveKey('KeyI', {}, DEFAULT_KEYMAP, 11)).toBeNull();
  expect(JSON.stringify(map)).toBe(before);
});
