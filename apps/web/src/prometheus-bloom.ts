export const bloomTiming={duration:3600,leadIn:150,openEnd:1300,closeStart:2350,distance:1.50} as const;
const ease=(t:number)=>{const value=Math.max(0,Math.min(1,t));return value*value*(3-2*value);};
/** One opening, a stable hold and a return to the EXACT saved positions. No randomness. */
export function bloomAmount(elapsed:number):number{
  if(elapsed<=bloomTiming.leadIn||elapsed>=bloomTiming.duration)return 0;
  if(elapsed<bloomTiming.openEnd)return ease((elapsed-bloomTiming.leadIn)/(bloomTiming.openEnd-bloomTiming.leadIn));
  if(elapsed<=bloomTiming.closeStart)return 1;
  return 1-ease((elapsed-bloomTiming.closeStart)/(bloomTiming.duration-bloomTiming.closeStart));
}
