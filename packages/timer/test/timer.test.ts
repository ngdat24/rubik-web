import { expect, it } from 'vitest';
import { Cube, invert, parseMove, scrambleAt, statistic, ENGINE_VERSION } from '@rubik/engine';
import { SolveTimer } from '../src/index.js';
const options={newId:()=> '550e8400-e29b-41d4-a716-446655440000',now:()=>new Date('2026-11-11T04:00:00.000Z')};
const create=(size=3)=>{const timer=new SolveTimer(options);timer.arm({size,seed:'seed',scrambleIndex:0});return timer;};
const unsolved=new Cube().applyMove('R').state;
it.each([[15000,'none'],[15000.9,'none'],[15001,'+2'],[17000,'+2'],[17000.9,'+2'],[17001,'DNF']])('inspection %s yields %s',(delta,penalty)=>{
 const t=create();t.startInspection(0.35);t.recordMove('R',unsolved,0.35+Number(delta));
 if(penalty==='DNF'){expect(t.phase).toBe('finished');expect(t.result!.events).toEqual([]);}
 else {t.recordMove("R'",new Cube().state,0.35+Number(delta)+123.75);expect(t.result!.timeMs).toBe(123);}
 expect(t.result!.penalty).toBe(penalty);
});
it('timeout via advance and late gate is identical, idempotent and retains preEvents',()=>{
 const a=create(),b=create();for(const t of [a,b]){t.startInspection(10.5);t.recordMove('x',new Cube().state,12.2);}
 a.advance(17012);expect(b.canApply(parseMove('R'),17012)).toBe(false);
 expect(a.result).toEqual(b.result);const result=a.result;a.advance(999999);expect(a.result).toEqual(result);
 expect(result).toMatchObject({inspectionMs:17001,timeMs:0,penalty:'DNF',events:[],preEvents:[{m:'x',t:1}]});
});
it('records independent origins, equal stamps and rotations while solving',()=>{
 const t=create();t.startInspection(0.75);t.recordMove('y',unsolved,1201.5);t.recordMove('R',unsolved,8401.25);
 t.recordMove('x',unsolved,8401.25);t.recordMove("R'",new Cube().state,8921.99);
 expect(t.result!.preEvents).toEqual([{m:'y',t:1200}]);expect(t.result!.events).toEqual([{m:'R',t:0},{m:'x',t:0},{m:"R'",t:520}]);
 expect(t.result!.inspectionMs).toBe(8400);expect(t.result!.timeMs).toBe(520);
 const copy=t.result!;copy.events[0]!.t=999;expect(t.result!.events[0]!.t).toBe(0);
});
it.each([2,3,5])('replays a generated scramble to solved for N=%s',(size)=>{
 const t=create(size),cube=new Cube(size).applyMoves(scrambleAt('seed',size,0));
 t.startInspection(1.25);let stamp=100.75;
 for(const move of invert(scrambleAt('seed',size,0),size)){
  if(t.phase==='finished')break;
  cube.applyMove(move);t.recordMove(move,cube.state,stamp);stamp+=17.35;
 }
 expect(cube.isSolved()).toBe(true);expect(t.phase).toBe('finished');expect(t.result!.timeMs).toBe(t.result!.events.at(-1)!.t);expect(t.result!.events[0]!.t).toBe(0);
});
it.each(['R','Rw','M'])('%s is a layer move, not inspection rotation',(move)=>{
 const t=create();t.startInspection(0);t.recordMove(move,unsolved,20);expect(t.phase).toBe('solving');
});
it('rejects idle/finished, bad stamps and out-of-order events; cancel/disarm reset',()=>{
 const t=create();for(const m of ['R','x'])expect(t.canApply(parseMove(m),1)).toBe(false);
 expect(t.startInspection(10)).toBe(true);expect(t.startInspection(11)).toBe(false);
 for(const stamp of [NaN,Infinity,-1,9])expect(t.canApply(parseMove('R'),stamp)).toBe(false);
 t.recordMove('R',unsolved,20);expect(t.canApply(parseMove('U'),19)).toBe(false);
 t.recordMove("R'",new Cube().state,30);expect(t.canApply(parseMove('R'),31)).toBe(false);
 t.cancel();expect(t.phase).toBe('idle');expect(t.result).toBeUndefined();t.startInspection(40);t.disarm();expect(t.armed).toBe(false);expect(t.startInspection(50)).toBe(false);
});
it.each(['idle','inspecting','solving','finished'])('cancel in %s produces no result',(phase)=>{
 const t=create();if(phase!=='idle')t.startInspection(0);
 if(['solving','finished'].includes(phase))t.recordMove('R',unsolved,1);
 if(phase==='finished')t.recordMove("R'",new Cube().state,2);
 t.cancel();expect(t.phase).toBe('idle');expect(t.result).toBeUndefined();
});
it('matches spec 09 fixture field names and integer values',()=>{
 const t=create();t.arm({size:3,seed:'a1b2c3d4-e5f6-7890-abcd-ef1234567890',scrambleIndex:0});t.startInspection(0);
 t.recordMove('y',unsolved,1200);t.recordMove("x'",unsolved,2500);
 for(const [m,stamp] of [['R',8400],['U',8580],["R'",8750],["U'",8920]] as const)t.recordMove(m,stamp===8920?new Cube().state:unsolved,stamp);
 expect(t.result).toEqual({schemaVersion:1,id:options.newId(),size:3,seed:'a1b2c3d4-e5f6-7890-abcd-ef1234567890',scrambleIndex:0,scrambleSource:'generated',genVersion:1,engineVersion:ENGINE_VERSION,preEvents:[{m:'y',t:1200},{m:"x'",t:2500}],events:[{m:'R',t:0},{m:'U',t:180},{m:"R'",t:350},{m:"U'",t:520}],inspectionMs:8400,timeMs:520,penalty:'none',startedAt:'2026-11-11T04:00:00.000Z'});
});
it('notifies phase changes, supports unsubscribe and rejects invalid contexts',()=>{
 const t=create(),phases:string[]=[];const off=t.onChange(p=>phases.push(p));t.startInspection(0);expect(()=>t.arm({size:3,seed:'a',scrambleIndex:0})).toThrow();t.recordMove('R',unsolved,1);t.recordMove("R'",new Cube().state,2);expect(phases).toEqual(['inspecting','solving','finished']);off();t.cancel();expect(phases).toHaveLength(3);
 expect(()=>t.arm({size:11,seed:'a',scrambleIndex:0})).toThrow();expect(()=>t.arm({size:3,seed:'a',scrambleIndex:-1})).toThrow();
});

it.each(['single','mo3','ao5','ao12'] as const)('timer results work with engine %s statistics',(kind)=>{
 const t=create();t.startInspection(0);t.recordMove('R',unsolved,1);t.recordMove("R'",new Cube().state,1001);
 const rows=Array.from({length:12},()=>t.result!);
 expect(statistic(kind,rows).resultMs).toBe(1000);
 const one=[...rows.slice(0,-1),{...t.result!,penalty:'DNF' as const}];
 expect(statistic(kind,one).resultMs).toBe(kind==='mo3'?null:1000);
 const two=[...rows.slice(0,-2),{...t.result!,penalty:'DNF' as const},{...t.result!,penalty:'DNF' as const}];
 expect(statistic(kind,two).resultMs).toBe(kind==='single'?1000:null);
});
