import {expect,it,vi} from 'vitest';
import {CubeController} from '@rubik/controller';
import {Cube,invert,scrambleAt} from '@rubik/engine';
import {SolveTimer} from '@rubik/timer';

function setup(size:number){
  const display={isAnimating:true,enqueueMove:vi.fn(),enqueueMoves:vi.fn(),setSize:vi.fn(),setState:vi.fn(),dispose:vi.fn()};
  const controller=new CubeController(display,size);
  controller.scramble('gd6');
  const timer=new SolveTimer({newId:()=> 'gd6-result',now:()=>new Date('2026-11-13T00:00:00Z')});
  timer.arm({size,seed:'gd6',scrambleIndex:0});
  timer.onChange(()=>{if(timer.phase==='finished')controller.lockInput('timer');});
  controller.setMoveGate((move,stamp)=>timer.canApply(move,stamp));
  controller.onMoveApplied(event=>timer.recordMove(event.move,event.stateAfter,event.t));
  timer.startInspection(10);
  return {controller,timer,display};
}

it.each([2,3])('keeps timer, engine and display consistent when a batch would finish N=%s midway',size=>{
  const {controller,timer,display}=setup(size);
  const solution=invert(scrambleAt('gd6',size,0),size),before=controller.cube.state;
  expect(controller.moves([...solution,'U'],20)).toBe(false);
  expect(controller.sequence([...solution,'U'].join(' '),20)).toBe(0);
  expect(controller.cube.state).toEqual(before);expect(timer.phase).toBe('inspecting');
  expect(display.enqueueMoves).not.toHaveBeenCalled();expect(timer.result).toBeUndefined();
  for(const [i,move] of solution.entries())expect(controller.applyMove(move,100+i*20)).toBe(true);
  expect(timer.phase).toBe('finished');expect(controller.isSolved()).toBe(true);
  const result=timer.result!;
  expect(result.events).toHaveLength(solution.length);
  expect(result.timeMs).toBe((solution.length-1)*20);
  expect(new Cube(size).applyMoves(scrambleAt('gd6',size,0)).applyMoves(result.events.map(e=>e.m)).isSolved()).toBe(true);
  expect(display.enqueueMove.mock.calls.at(-1)![1]).toEqual(controller.cube.state);
  expect(controller.applyMove('U',999)).toBe(false);expect(timer.result).toEqual(result);
});

it('a late input finishes inspection as DNF without changing the cube or display',()=>{
  const {controller,timer,display}=setup(3),before=controller.cube.state;
  expect(controller.applyMove('R',17011)).toBe(false);
  expect(timer.result).toMatchObject({penalty:'DNF',inspectionMs:17001,timeMs:0,events:[]});
  expect(controller.cube.state).toEqual(before);expect(controller.lastInput).toBeUndefined();
  expect(display.enqueueMove).not.toHaveBeenCalled();expect(controller.inputEnabled).toBe(false);
});
