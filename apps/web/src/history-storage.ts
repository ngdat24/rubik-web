import type { HistoryBackup } from '@rubik/timer';
export const HISTORY_DB='rubik-history-v1';
let revision:number|undefined;
let storageKey='backup';
export function scopeHistory(userId:string|undefined):void{storageKey=userId?'backup:'+userId:'backup';revision=undefined;}
function open():Promise<IDBDatabase>{return new Promise((resolve,reject)=>{
 const r=indexedDB.open(HISTORY_DB,1);let blocked=false;
 r.onupgradeneeded=()=>{r.result.createObjectStore('history');};r.onerror=()=>reject(r.error);r.onblocked=()=>{blocked=true;reject(new Error('Storage blocked'));};r.onsuccess=()=>{if(blocked)r.result.close();else resolve(r.result);};
});}
export async function loadHistory():Promise<unknown>{const db=await open();try{return await new Promise((resolve,reject)=>{
 const tx=db.transaction('history','readonly'),r=tx.objectStore('history').get(storageKey);tx.oncomplete=()=>{const value=r.result;revision=value?.revision??0;resolve(value?.backup??value);};tx.onabort=()=>reject(tx.error);tx.onerror=()=>reject(tx.error);
});}finally{db.close();}}
export async function saveHistory(backup:HistoryBackup):Promise<void>{const db=await open();try{await new Promise<void>((resolve,reject)=>{
 const tx=db.transaction('history','readwrite'),store=tx.objectStore('history'),read=store.get(storageKey);
 read.onsuccess=()=>{try{if(revision===undefined||(read.result?.revision??0)!==revision){tx.abort();return;}store.put({revision:revision+1,backup},storageKey);}catch(error){tx.abort();reject(error);}};
 tx.oncomplete=()=>{revision=(revision??0)+1;resolve();};tx.onabort=()=>reject(tx.error);tx.onerror=()=>reject(tx.error);
});}finally{db.close();}}
