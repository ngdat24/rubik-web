import {expect,it} from 'vitest';
import {SolveHistory} from '../src/history.js';
import type {Solve} from '../src/index.js';
const solve=(id:string,timeMs=1000,size=3,penalty:Solve['penalty']='none'):Solve=>({schemaVersion:1,id,size,seed:'seed',scrambleIndex:0,scrambleSource:'generated',genVersion:1,engineVersion:'0.1.0',preEvents:[],events:[{m:'R',t:0}],inspectionMs:100,timeMs,penalty,startedAt:'2026-11-12T00:00:00.000Z'});
it('keeps original records independent, overrides separate and restores original penalty',()=>{
 const h=new SolveHistory(),s=solve('a',1000,3,'+2');h.add(s);s.events[0]!.m='bad';
 h.edit('a','none');expect(h.penalty('a')).toBe('none');expect(h.list(3)[0]!.solve.penalty).toBe('+2');expect(h.list(3)[0]!.solve.timeMs).toBe(1000);
 const copy=h.list(3);copy[0]!.solve.events[0]!.m='bad';expect(h.list(3)[0]!.solve.events[0]!.m).toBe('R');
 h.edit('a',null);expect(h.penalty('a')).toBe('+2');expect(h.list(3)[0]!.penaltyOverride).toBeNull();
});
it('deduplicates finish events, lists newest first and isolates sizes and sessions',()=>{
 const h=new SolveHistory();expect(h.add(solve('a',1000))).toBe(true);expect(h.add(solve('a',999))).toBe(false);
 h.add(solve('b',2000));h.add(solve('c',1,7));expect(h.list(3).map(e=>e.solve.id)).toEqual(['b','a']);expect(h.statistics(3).single!.resultMs).toBe(1000);expect(h.statistics(7).single!.resultMs).toBe(1);
 expect(new SolveHistory().list(3)).toEqual([]);
});
it('recomputes penalties, averages, DNF and deletion using chronological windows',()=>{
 const h=new SolveHistory();for(let i=0;i<12;i++)h.add(solve(String(i),(i+1)*1000));
 expect(h.statistics(3).ao5!.resultMs).toBe(10000);expect(h.statistics(3).ao12!.resultMs).toBe(6500);
 h.edit('11','DNF');expect(h.statistics(3).ao5!.resultMs).toBe(10000);expect(h.statistics(3).mo3!.display).toBe('DNF');
 h.edit('10','DNF');expect(h.statistics(3).ao5!.display).toBe('DNF');expect(h.statistics(3).ao12!.display).toBe('DNF');
 h.delete('11');expect(h.list(3)).toHaveLength(11);expect(h.statistics(3).ao12!.display).toBe('-');
 expect(h.delete('missing')).toBe(false);expect(h.edit('missing','none')).toBe(false);expect(()=>h.edit('0','bad' as any)).toThrow();
});
it('single all DNF is dash while averages DNF are results',()=>{
 const h=new SolveHistory();for(let i=0;i<12;i++)h.add(solve(String(i),0,3,'DNF'));
 expect(h.statistics(3).single!.display).toBe('-');for(const k of ['mo3','ao5','ao12'])expect(h.statistics(3)[k]!.display).toBe('DNF');
 h.edit('0','+2');expect(h.statistics(3).single!.resultMs).toBe(2000);
});
