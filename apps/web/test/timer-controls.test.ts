import {afterEach,expect,it,vi} from 'vitest';
import {CubeController} from '@rubik/controller';
import {invert,scrambleAt} from '@rubik/engine';

vi.mock('../src/i18n.js',()=>({t:(text:string)=>text}));
vi.mock('../src/leaderboard.js',()=>({attachLeaderboard:()=>({completed:vi.fn(),dispose:vi.fn()})}));
vi.mock('../src/history-controls.js',()=>({attachHistory:()=>({changed:vi.fn(),render:vi.fn(),dispose:vi.fn()})}));
vi.mock('../src/history-storage.js',()=>({scopeHistory:vi.fn()}));
vi.mock('../src/cloud-controls.js',()=>({attachCloudHistory:()=>({completed:vi.fn(),dispose:vi.fn()})}));
import {attachTimer} from '../src/timer-controls.js';

class Element extends EventTarget {
  disabled=false;textContent='';hidden=true;
  blur(){} close(){this.hidden=true;} showModal(){this.hidden=false;}
  matches(){return false;}
}
const cleanups:(()=>void)[]=[];
afterEach(()=>{for(const off of cleanups.splice(0))off();vi.unstubAllGlobals();vi.clearAllMocks();});

function setup(manual=false,asynchronous=false,completion?:Promise<void>){
  const elements=new Map<string,Element>();
  const element=(id:string)=>{if(!elements.has(id))elements.set(id,new Element());return elements.get(id)!;};
  const document=Object.assign(new EventTarget(),{hidden:false,activeElement:new Element(),
    getElementById:element,querySelector:()=>null,
    querySelectorAll:()=>['cube-size','reset','key-settings-open'].map(element)});
  const window=Object.assign(new EventTarget(),{setTimeout});
  vi.stubGlobal('document',document);vi.stubGlobal('window',window);vi.stubGlobal('HTMLElement',Element);
  vi.stubGlobal('requestAnimationFrame',vi.fn(()=>1));vi.stubGlobal('cancelAnimationFrame',vi.fn());
  const controller=new CubeController({setSize:vi.fn(),setState:vi.fn(),isAnimating:false,
    enqueueMove:vi.fn(),enqueueMoves:vi.fn(),dispose:vi.fn()},3);
  let release=()=>{};
  const prepare=vi.fn(()=>{
    controller.scramble('prometheus-flow');
    if(asynchronous)return new Promise<void>(resolve=>{release=()=>{ui.scrambled('prometheus-flow');resolve();};});
    ui.scrambled('prometheus-flow');
  });
  const ui=attachTimer(controller,prepare,undefined,()=>completion,()=>!manual);
  cleanups.push(()=>{ui.dispose();controller.dispose();});
  const click=()=>element('timer-start').dispatchEvent(new Event('click'));
  const solve=()=>{for(const [i,move] of invert(scrambleAt('prometheus-flow',3,0),3).entries())
    expect(controller.applyMove(move,performance.now()+100+i*10)).toBe(true);};
  return {element,window,controller,ui,prepare,click,solve,release:()=>release()};
}

it('blocks inspection and duplicate prepares until asynchronous preparation finishes',async()=>{
  const f=setup(true,true);f.click();
  expect(f.prepare).toHaveBeenCalledOnce();expect(f.element('timer-start').disabled).toBe(true);
  expect(f.ui.isRunning()).toBe(true);expect(f.controller.applyMove('R',performance.now())).toBe(false);
  const space=new Event('keydown',{cancelable:true});Object.defineProperty(space,'code',{value:'Space'});
  f.window.dispatchEvent(space);expect(f.prepare).toHaveBeenCalledOnce();
  f.release();await Promise.resolve();await Promise.resolve();
  expect(f.element('timer-start').disabled).toBe(false);expect(f.ui.isRunning()).toBe(false);
  f.click();expect(f.element('timer-phase').textContent).toContain('Inspection');
});

it('keeps the completed Prometheus solve after celebration and requires an explicit new prepare',async()=>{
  let complete!:()=>void;const completion=new Promise<void>(resolve=>{complete=resolve;});
  const f=setup(true,false,completion);f.click();f.click();f.solve();
  expect(f.element('timer-start').disabled).toBe(true);expect(f.prepare).toHaveBeenCalledOnce();
  complete();await Promise.resolve();await Promise.resolve();
  expect(f.element('timer-start').disabled).toBe(false);
  expect(f.element('timer-phase').textContent).toBe('Đã kết thúc');
  expect(f.controller.isSolved()).toBe(true);expect(f.prepare).toHaveBeenCalledOnce();
  expect(f.controller.applyMove('R',performance.now()+1000)).toBe(false);
  f.click();expect(f.prepare).toHaveBeenCalledTimes(2);
  expect(f.element('timer-phase').textContent).toContain('Sẵn sàng');
});

it('preserves automatic next-scramble behavior for other skins',()=>{
  const f=setup();f.click();f.click();f.solve();
  expect(f.prepare).toHaveBeenCalledTimes(2);expect(f.controller.isSolved()).toBe(false);
  expect(f.element('timer-phase').textContent).toContain('Sẵn sàng');
});
