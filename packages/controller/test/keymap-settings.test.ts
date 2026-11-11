import { expect, it } from 'vitest';
import { DEFAULT_KEYMAP } from '../src/keyboard.js';
import { assignBinding, bindingConflict, defaultSettings, importSettings, isAssignableCode, loadSettings, saveSettings, validateSettings } from '../src/keymap-settings.js';

it('detects conflicts and resolves reassign/swap without mutating input', () => {
  const map={KeyA:'R',KeyB:'U',KeyC:'U'};
  expect(bindingConflict(map,'KeyA','U')).toEqual({source:'R',targetKeys:['KeyB','KeyC'],needsReplacement:true});
  expect(()=>assignBinding(map,'KeyA','U','reassign')).toThrow();
  expect(()=>assignBinding(map,'KeyA','U','swap','KeyZ')).toThrow();
  expect(assignBinding(map,'KeyA','U','reassign','KeyB')).toEqual({KeyA:'U',KeyC:'U'});
  expect(assignBinding(map,'KeyA','U','swap','KeyB')).toEqual({KeyA:'U',KeyB:'R',KeyC:'U'});
  expect(map).toEqual({KeyA:'R',KeyB:'U',KeyC:'U'});
  expect(()=>assignBinding(map,'KeyZ','U','swap','KeyB')).toThrow();
});

it('roundtrips profiles, retains defaults and rejects invalid imports atomically', () => {
  const settings=defaultSettings(); settings.profiles.mine={bindings:{KeyA:'R',KeyB:'Rw',KeyC:'3R',KeyD:'M'}};settings.activeProfile='mine';
  expect(importSettings(JSON.stringify(settings))).toEqual(settings);
  const invalid: unknown[]=[null,[],{}, {...settings,version:0},{...settings,version:2},{...settings,activeProfile:'missing'},
    {...settings,profiles:{mine:{bindings:{KeyA:'R',KeyB:'R',KeyC:'R'}}}},
    {...settings,profiles:{mine:{bindings:{KeyW:'R'}}}},
    {...settings,profiles:{mine:{bindings:{KeyA:'bad'}}}},
    {...settings,profiles:{mine:{bindings:{KeyA:"R2'"}}}},
    {...settings,profiles:{default:{bindings:{KeyR:'U'}},mine:settings.profiles.mine}},
    JSON.parse('{"version":1,"activeProfile":"__proto__","profiles":{"__proto__":{"bindings":{}}}}')];
  for(const value of invalid) expect(()=>validateSettings(value)).toThrow();
  expect(()=>importSettings('{bad')).toThrow();
  expect(()=>importSettings(' '.repeat(100001))).toThrow();
  expect(settings.profiles.default!.bindings).toEqual(DEFAULT_KEYMAP);
  const noDefault={version:1,activeProfile:'mine',profiles:{mine:{bindings:{KeyA:'R'}}}};
  expect(validateSettings(noDefault).profiles.default!.bindings).toEqual(DEFAULT_KEYMAP);
});

it('allows only safe physical keys and rejects system keys/modifiers/selectors', () => {
  for(const code of ['KeyA','KeyZ','Semicolon','BracketLeft']) expect(isAssignableCode(code)).toBe(true);
  for(const code of ['Space','Tab','Escape','F5','F12','KeyW','Digit3','Numpad3','ControlLeft','AltLeft','ArrowDown','toString']) {
    expect(isAssignableCode(code)).toBe(false);
    expect(()=>assignBinding({},code,'R','reassign')).toThrow();
  }
});

it('handles missing, corrupt, unsupported and unavailable storage', () => {
  expect(loadSettings(()=>({getItem:()=>null,setItem:()=>{}}))).toEqual({settings:defaultSettings(),warning:''});
  for(const text of ['bad',JSON.stringify({...defaultSettings(),version:0})]) {
    const loaded=loadSettings(()=>({getItem:()=>text,setItem:()=>{}}));
    expect(loaded.settings).toEqual(defaultSettings());expect(loaded.warning).not.toBe('');
  }
  const blocked=()=>{throw new Error('SecurityError');};
  expect(loadSettings(blocked).settings).toEqual(defaultSettings());
  expect(saveSettings(defaultSettings(),blocked)).toBe(false);
  expect(saveSettings(defaultSettings(),()=>({getItem:()=>null,setItem:()=>{throw new Error('QuotaExceeded');}}))).toBe(false);
  let stored='';expect(saveSettings(defaultSettings(),()=>({getItem:()=>null,setItem:(_key,value)=>{stored=value;}}))).toBe(true);
  expect(importSettings(stored)).toEqual(defaultSettings());
});
