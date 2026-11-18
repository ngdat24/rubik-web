import {afterEach,expect,it,vi} from 'vitest';
import {mountWallet} from '../src/wallet.js';
import type {CloudAccount} from '../src/account.js';

vi.mock('../src/i18n.js',()=>({language:'en',t:(text:string)=>text}));
afterEach(()=>vi.unstubAllGlobals());
it('defers hidden refreshes, updates on visibility and detaches on dispose',async()=>{
  const balance={hidden:true,textContent:'',children:[] as {textContent:string}[],replaceChildren(...children:{textContent:string}[]){this.children=children;this.textContent=children.map(child=>child.textContent).join('');}};
  const doc=Object.assign(new EventTarget(),{hidden:true,querySelector:()=>balance,createElement:()=>({textContent:''})});
  const win=new EventTarget();
  const fetcher=vi.fn(async()=>({ok:true,status:200,json:async()=>({cb:123,zn:2})}));
  vi.stubGlobal('document',doc);vi.stubGlobal('window',win);vi.stubGlobal('fetch',fetcher);
  const wallet=mountWallet({token:async()=> 'fixture'} as CloudAccount);
  await wallet.refresh();win.dispatchEvent(new Event('online'));
  expect(fetcher).not.toHaveBeenCalled();
  doc.hidden=false;doc.dispatchEvent(new Event('visibilitychange'));
  await vi.waitFor(()=>expect(balance.textContent).toBe('123 CB2 ZN'));
  expect(balance.children.map(child=>child.textContent)).toEqual(['123 CB','2 ZN']);
  expect(fetcher).toHaveBeenCalledTimes(1);
  doc.hidden=true;win.dispatchEvent(new Event('online'));await wallet.refresh();
  expect(fetcher).toHaveBeenCalledTimes(1);
  wallet.dispose();doc.hidden=false;doc.dispatchEvent(new Event('visibilitychange'));
  win.dispatchEvent(new Event('online'));await wallet.refresh();
  expect(fetcher).toHaveBeenCalledTimes(1);
});
