import {expect,it} from 'vitest';
import {SolveHistory,validateHistoryBackup} from '../src/index.js';
import type {Solve} from '../src/index.js';
const solve:Solve={schemaVersion:1,id:'a',size:3,seed:'s',scrambleIndex:0,scrambleSource:'generated',genVersion:1,engineVersion:'0.1.0',preEvents:[],events:[{m:'R',t:0},{m:"R'",t:100}],inspectionMs:20,timeMs:100,penalty:'none',startedAt:'2026-11-13T00:00:00.000Z'};
const backup=()=>({version:1,entries:[{solve:{...solve},penaltyOverride:'+2'}]});
it('roundtrips original and override and merges duplicates without overwriting',()=>{
 const b=validateHistoryBackup(backup()),h=new SolveHistory();expect(h.merge(b.entries)).toBe(1);h.edit('a','DNF');expect(h.merge(b.entries)).toBe(0);expect(h.penalty('a')).toBe('DNF');expect(h.entries()[0]!.solve.penalty).toBe('none');
 h.add({...solve,id:'new',startedAt:'2027-01-01T00:00:00.000Z'});h.merge([{solve:{...solve,id:'old',startedAt:'2020-01-01T00:00:00.000Z'},penaltyOverride:null}]);expect(h.list(3).map(e=>e.solve.id)).toEqual(['new','a','old']);
});
it('rejects bad schema, duplicate IDs, unsafe times and malformed events before mutation',()=>{
 for(const bad of [null,{}, {...backup(),version:2},{...backup(),entries:[...backup().entries,...backup().entries]}, {...backup(),entries:[{solve:{...solve,size:11},penaltyOverride:null}]}, {...backup(),entries:[{solve:{...solve,timeMs:-1},penaltyOverride:null}]}, {...backup(),entries:[{solve:{...solve,events:[{m:'bad',t:0}]},penaltyOverride:null}]}])expect(()=>validateHistoryBackup(bad)).toThrow();
});
