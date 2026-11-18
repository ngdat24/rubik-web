import {bloomTiming} from './prometheus-bloom.js';

/** Cosmetic state only. The controller supplies solved status at input time. */
export class SolvedUnification {
  readonly amount={value:1};
  readonly wave={value:-1};
  readonly floor={value:0};
  private solved=true;
  private transition:{start:number;from:number;to:number;duration:number}|undefined;
  constructor(private readonly reducedMotion=false){}
  setSolved(solved:boolean,now:number,immediate=false){
    this.update(now);
    if(immediate){this.solved=solved;this.transition=undefined;this.amount.value=solved?1:0;this.wave.value=-1;return;}
    if(solved===this.solved)return;
    this.solved=solved;
    if(!solved){
      this.wave.value=-1;
      this.transition={start:now,from:this.amount.value,to:0,duration:this.reducedMotion?0:2000};
    }
  }
  /** Called only once the final move has finished displaying and the bloom begins. */
  reveal(now:number){
    if(!this.solved)return;
    this.floor.value=this.amount.value;
    this.transition={start:now,from:this.amount.value,to:1,duration:this.reducedMotion?0:bloomTiming.openEnd};
    this.wave.value=0;
    this.update(now);
  }
  update(now:number){
    if(!this.transition)return;
    const {start,from,to,duration}=this.transition;
    const t=duration===0?1:Math.max(0,Math.min(1,(now-start)/duration));
    const eased=t*t*(3-2*t);
    this.amount.value=from+(to-from)*eased;
    if(to===1)this.wave.value=t;
    if(t===1){this.transition=undefined;this.wave.value=-1;}
  }
}
