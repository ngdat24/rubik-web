import {expect,it,vi} from 'vitest';
import {newId} from '../src/id.js';
it('creates RFC 4122 v4 IDs on HTTP without randomUUID',()=>{
 const bytes=new Uint8Array(16).fill(255);
 vi.stubGlobal('crypto',{getRandomValues:(target:Uint8Array)=>{target.set(bytes);return target;}});
 try {expect(newId()).toBe('ffffffff-ffff-4fff-bfff-ffffffffffff');} finally {vi.unstubAllGlobals();}
});
it('uses the native UUID implementation when available',()=>{
 vi.stubGlobal('crypto',{randomUUID:()=> 'native-id'});
 try {expect(newId()).toBe('native-id');} finally {vi.unstubAllGlobals();}
});
