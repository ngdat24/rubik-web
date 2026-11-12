import { parseMove } from '@rubik/engine';
import type { MoveEvent, Penalty } from '@rubik/engine';
import type { HistoryEntry } from './history.js';
import type { Solve } from './index.js';

export interface HistoryBackup {version:1; entries:HistoryEntry[]}
const object=(x:unknown):x is Record<string,unknown>=>typeof x==='object'&&x!==null&&!Array.isArray(x);
const integer=(x:unknown):x is number=>typeof x==='number'&&Number.isSafeInteger(x)&&x>=0;
const penalty=(x:unknown):x is Penalty=>x==='none'||x==='+2'||x==='DNF';
function events(x:unknown,size:number,pre:boolean):MoveEvent[]{
  if(!Array.isArray(x)||x.length>(pre?100:2000))throw new Error('Danh sách nước không hợp lệ.');
  let last=0;
  return x.map(e=>{
    if(!object(e)||typeof e.m!=='string'||!integer(e.t)||e.t<last)throw new Error('Mốc nước không hợp lệ.');
    const parsed=parseMove(e.m,size);if(parsed.canonical!==e.m||(pre&&parsed.type!=='rotation'))throw new Error('Ký hiệu nước không hợp lệ.');
    last=e.t;return {m:e.m,t:e.t};
  });
}
export function validateHistoryBackup(value:unknown):HistoryBackup {
  if(!object(value)||value.version!==1||!Array.isArray(value.entries)||value.entries.length>10000)throw new Error('Backup không đúng định dạng hoặc phiên bản.');
  const ids=new Set<string>();
  const entries=value.entries.map(entry=>{
    if(!object(entry)||!object(entry.solve)||(entry.penaltyOverride!==null&&!penalty(entry.penaltyOverride)))throw new Error('Phạt chỉnh không hợp lệ.');
    const s=entry.solve;
    if(s.schemaVersion!==1||typeof s.id!=='string'||!s.id.length||s.id.length>100||ids.has(s.id)||!integer(s.size)||s.size<2||s.size>10||typeof s.seed!=='string'||s.seed.length>256||!integer(s.scrambleIndex)||s.scrambleSource!=='generated'||s.genVersion!==1||typeof s.engineVersion!=='string'||s.engineVersion.length>50||!integer(s.inspectionMs)||!integer(s.timeMs)||s.timeMs>Number.MAX_SAFE_INTEGER-2000||!penalty(s.penalty)||typeof s.startedAt!=='string'||!Number.isFinite(Date.parse(s.startedAt)))throw new Error('Bản ghi Solve không hợp lệ hoặc ID trùng.');
    const preEvents=events(s.preEvents,s.size,true),moves=events(s.events,s.size,false);
    if((preEvents.at(-1)?.t??0)>s.inspectionMs)throw new Error('Thời gian inspection không khớp.');
    if(s.inspectionMs>17000){if(s.penalty!=='DNF'||moves.length||s.timeMs!==0)throw new Error('DNF inspection không hợp lệ.');}
    else if(!moves.length||moves[0]!.t!==0||parseMove(moves[0]!.m,s.size).type==='rotation'||moves.at(-1)!.t!==s.timeMs)throw new Error('Thời gian solve không khớp.');
    ids.add(s.id);
    const solve:Solve={schemaVersion:1,id:s.id,size:s.size,seed:s.seed,scrambleIndex:s.scrambleIndex,scrambleSource:'generated',genVersion:1,engineVersion:s.engineVersion,preEvents,events:moves,inspectionMs:s.inspectionMs,timeMs:s.timeMs,penalty:s.penalty,startedAt:s.startedAt};
    return {solve,penaltyOverride:entry.penaltyOverride as Penalty|null};
  });
  return {version:1,entries};
}
export function parseHistoryBackup(text:string):HistoryBackup {
  if(text.length>10_000_000)throw new Error('Backup quá lớn (tối đa 10 MB).');
  let value:unknown;try{value=JSON.parse(text);}catch{throw new Error('JSON backup không hợp lệ.');}
  return validateHistoryBackup(value);
}
export function historyCsv(entries:readonly HistoryEntry[]):string {
  const cell=(v:string|number)=>'"'+String(v).replace(/^[=+@\-\t\r]/,"'$&").replace(/"/g,'""')+'"';
  return '\uFEFF'+[['id','size','startedAt','timeMs','originalPenalty','penaltyOverride','effectivePenalty'],...entries.map(e=>[e.solve.id,e.solve.size,e.solve.startedAt,e.solve.timeMs,e.solve.penalty,e.penaltyOverride??'',e.penaltyOverride??e.solve.penalty])].map(row=>row.map(cell).join(',')).join('\r\n');
}
