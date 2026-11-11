import { expect, it } from 'vitest';
import { DEFAULT_KEYMAP, resolveKey } from '../src/keyboard.js';

it('resolves every default base, inverse and double for all supported sizes', () => {
  expect(DEFAULT_KEYMAP).toEqual({KeyU:'U',KeyR:'R',KeyF:'F',KeyD:'D',KeyL:'L',KeyB:'B',KeyM:'M',KeyE:'E',KeyS:'S',KeyX:'x',KeyY:'y',KeyZ:'z'});
  for (let n=2;n<=10;n++) for (const [code,move] of Object.entries(DEFAULT_KEYMAP)) {
    const valid = !'MES'.includes(move) || n===3;
    expect(resolveKey(code, {}, DEFAULT_KEYMAP,n)).toBe(valid ? move : null);
    expect(resolveKey(code, {shiftKey:true}, DEFAULT_KEYMAP,n)).toBe(valid ? move+"'" : null);
    expect(resolveKey(code, {altKey:true}, DEFAULT_KEYMAP,n)).toBe(valid ? move+'2' : null);
    expect(resolveKey(code, {shiftKey:true,altKey:true}, DEFAULT_KEYMAP,n)).toBe(valid ? move+'2' : null);
  }
});

it('resolves layer and width against engine limits for every face and N', () => {
  for(let n=2;n<=10;n++) for(const face of 'URFDLB') for(let layer=1;layer<=11;layer++) {
    const code='Key'+face;
    const singleValid=n===2 ? layer===1 : layer<=n;
    const wideValid=n>=3 && layer>=2 && layer<n;
    expect(resolveKey(code,{layer},DEFAULT_KEYMAP,n)).toBe(singleValid ? `${layer===1?'':layer}${face}` : null);
    expect(resolveKey(code,{layer,wide:true,shiftKey:true},DEFAULT_KEYMAP,n)).toBe(wideValid ? `${layer===2?'':layer}${face}w'` : null);
    expect(resolveKey(code,{layer,wide:true,altKey:true},DEFAULT_KEYMAP,n)).toBe(wideValid ? `${layer===2?'':layer}${face}w2` : null);
  }
  expect(resolveKey('KeyR',{wide:true},DEFAULT_KEYMAP,3)).toBe('Rw');
  for (const layer of [0,-1,1.5,NaN,Infinity]) expect(resolveKey('KeyR',{layer},DEFAULT_KEYMAP,7)).toBeNull();
  for (const code of ['KeyX','KeyY','KeyZ','KeyM','KeyE','KeyS']) {
    expect(resolveKey(code,{wide:true},DEFAULT_KEYMAP,3)).toBeNull();
    expect(resolveKey(code,{layer:2},DEFAULT_KEYMAP,3)).toBeNull();
  }
});

it('ignores system keys, Ctrl/Meta/AltGr and unmapped physical codes', () => {
  for (const modifiers of [{ctrlKey:true},{metaKey:true},{ctrlKey:true,altKey:true}])
    expect(resolveKey('KeyR',modifiers,DEFAULT_KEYMAP,3)).toBeNull();
  for (const code of ['Space','Escape','Tab','KeyW','KeyI','Digit3','toString','__proto__'])
    expect(resolveKey(code,{},DEFAULT_KEYMAP,3)).toBeNull();
  for (const code of ['Space','Escape','Tab','KeyW']) expect(resolveKey(code,{}, {[code]:'R'},3)).toBeNull();
});

it('does not mutate keymaps and toggles inverse base bindings consistently', () => {
  const map={KeyA:"R'",KeyB:'R2',KeyC:'bad'};
  expect(resolveKey('KeyA',{shiftKey:true},map,3)).toBe('R');
  expect(resolveKey('KeyA',{altKey:true},map,3)).toBe('R2');
  expect(resolveKey('KeyB',{shiftKey:true},map,3)).toBe('R2');
  expect(resolveKey('KeyC',{},map,3)).toBeNull();
  expect(map).toEqual({KeyA:"R'",KeyB:'R2',KeyC:'bad'});
});
