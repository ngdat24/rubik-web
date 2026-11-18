import {afterEach,expect,it,vi} from 'vitest';
import type {CloudAccount} from '../src/account.js';
import {championPreferenceKey,loadEquippedChampion} from '../src/champion-equipped.js';
vi.mock('../src/champion-design.js',()=>({
  loadChampionDesign:async()=>({interaction_fx:{sound_file:'champion.mp3'}}),
  championRendererOptions:(_:unknown,variant:string,size:number)=>({size,variant})
}));
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();});
const account={id:'owner',token:async()=>'session-token'} as CloudAccount;
const storage=(size:number)=>vi.stubGlobal('localStorage',{getItem:(key:string)=>key===championPreferenceKey('owner',size as 2|3)?'1':null});

it('does not apply a 2×2 preference to a 3×3 competitive cube',async()=>{
  storage(2);const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
  expect(await loadEquippedChampion(account,3)).toBeUndefined();expect(fetcher).not.toHaveBeenCalled();
});
it('verifies server ownership and ignores another size or an unclaimed award',async()=>{
  storage(3);vi.stubGlobal('fetch',vi.fn(async()=>Response.json({awards:[{size:2,variant:'borderless',name:'Two'},{size:3,variant:null,name:null}]})));
  expect(await loadEquippedChampion(account,3)).toBeUndefined();
});
it('restores the owner name and borderless Champion after a verified award',async()=>{
  storage(3);const fetcher=vi.fn(async()=>Response.json({awards:[{size:3,variant:'classic',name:'My Champion'}]}));vi.stubGlobal('fetch',fetcher);
  expect(await loadEquippedChampion(account,3)).toEqual({name:'My Champion',sound:'champion.mp3',options:{size:3,variant:'borderless'}});
  expect(fetcher.mock.calls[0]?.[1]).toMatchObject({method:'GET',headers:{Authorization:'Bearer session-token'}});
});
it('keeps the preference intact when the server is unavailable',async()=>{
  const setItem=vi.fn();vi.stubGlobal('localStorage',{getItem:()=> '1',setItem});vi.stubGlobal('fetch',vi.fn(async()=>{throw Error('offline');}));
  await expect(loadEquippedChampion(account,3)).rejects.toThrow('offline');expect(setItem).not.toHaveBeenCalled();
});
