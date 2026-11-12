import { dragTurn } from '@rubik/renderer';
import type { CubeRenderer } from '@rubik/renderer';
import type { CubeController } from '@rubik/controller';

/** Pointer gestures choose a move; only the controller commits engine state. */
export function attachDrag(renderer: CubeRenderer, controller: CubeController, changed: () => void): () => void {
  const canvas=renderer.canvas;
  const points=new Map<number,{x:number;y:number}>();
  let gesture: {id:number;x:number;y:number;hit:NonNullable<ReturnType<CubeRenderer['pick']>>;axis?:number;layer?:number;angle:number} | undefined;
  let pinching=false, distance=0;
  const pinchDistance=()=>{const p=[...points.values()];return p.length>=2?Math.hypot(p[0]!.x-p[1]!.x,p[0]!.y-p[1]!.y):0;};
  const cancel=():void=>{
    if(gesture || pinching) {renderer.endDrag();renderer.enableOrbit(true);controller.unlockInput('drag');}
    for(const id of points.keys()) if(canvas.hasPointerCapture(id))canvas.releasePointerCapture(id);
    points.clear();gesture=undefined;pinching=false;
  };
  const down=(e:PointerEvent):void=>{
    if(e.button!==0 || [...controller.lockedBy].some(reason=>reason!=='drag'))return;
    if(gesture || pinching){
      e.stopImmediatePropagation();e.preventDefault();points.set(e.pointerId,{x:e.clientX,y:e.clientY});canvas.setPointerCapture(e.pointerId);
      renderer.endDrag();gesture=undefined;pinching=true;distance=pinchDistance();return;
    }
    const hit=renderer.pick(e.clientX,e.clientY);
    if(!hit)return;
    e.stopImmediatePropagation();e.preventDefault();canvas.setPointerCapture(e.pointerId);
    points.set(e.pointerId,{x:e.clientX,y:e.clientY});gesture={id:e.pointerId,x:e.clientX,y:e.clientY,hit,angle:0};
    renderer.enableOrbit(false);controller.lockInput('drag');
  };
  const move=(e:PointerEvent):void=>{
    if(!points.has(e.pointerId))return;
    e.stopImmediatePropagation();e.preventDefault();points.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(pinching){const next=pinchDistance();if(distance>0 && next>0)renderer.zoomBy(distance/next);distance=next;return;}
    const g=gesture;if(!g || e.pointerId!==g.id)return;
    if(g.axis===undefined && Math.hypot(e.clientX-g.x,e.clientY-g.y)<8)return;
    const point=renderer.facePoint(e.clientX,e.clientY,g.hit.slot.normal,g.hit.point);if(!point)return;
    const delta=point.sub(g.hit.point).toArray();
    const turn=dragTurn(controller.size,g.hit.slot.index,delta);if(!turn)return;
    if(g.axis===undefined){g.axis=turn.axis;g.layer=turn.layer;renderer.beginDrag(turn.move);}
    const n=g.hit.slot.normal,d=delta;
    const cross=[n[1]*d[2]!-n[2]*d[1]!,n[2]*d[0]!-n[0]*d[2]!,n[0]*d[1]!-n[1]*d[0]!];
    const sensitivity=e.pointerType==='mouse'?0.675:1;
    g.angle=Math.max(-Math.PI,Math.min(Math.PI,cross[g.axis]!*Math.PI/1.5*sensitivity));renderer.updateDrag(g.angle);
  };
  const up=(e:PointerEvent):void=>{
    if(!points.has(e.pointerId))return;
    const timestamp=e.timeStamp;e.stopImmediatePropagation();e.preventDefault();
    const g=gesture;
    if(pinching){points.delete(e.pointerId);if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);if(!points.size)cancel();return;}
    const angle=renderer.endDrag();gesture=undefined;points.delete(e.pointerId);
    if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);
    renderer.enableOrbit(true);controller.unlockInput('drag');
    if(!g || g.axis===undefined)return;
    const turns=Math.round(Math.abs(angle)/(Math.PI/2));if(!turns)return;
    const layer=g.layer!;
    const opposite=controller.size===2 && layer===2;
    const face=(opposite?['L','D','B']:['R','U','F'])[g.axis]!;
    const token=`${layer===1 || opposite?'':layer}${face}${turns===2?'2':(angle>0)!==opposite?"'":''}`;
    if(controller.applyMove(token,timestamp)){renderer.resumeDrag(angle);changed();}
  };
  const interrupted=():void=>cancel();
  canvas.addEventListener('pointerdown',down,true);canvas.addEventListener('pointermove',move,true);canvas.addEventListener('pointerup',up,true);
  canvas.addEventListener('pointercancel',interrupted);canvas.addEventListener('lostpointercapture',interrupted);
  canvas.addEventListener('webglcontextlost',interrupted,true);window.addEventListener('blur',interrupted);document.addEventListener('visibilitychange',interrupted);
  return ()=>{cancel();canvas.removeEventListener('pointerdown',down,true);canvas.removeEventListener('pointermove',move,true);canvas.removeEventListener('pointerup',up,true);canvas.removeEventListener('pointercancel',interrupted);canvas.removeEventListener('lostpointercapture',interrupted);canvas.removeEventListener('webglcontextlost',interrupted,true);window.removeEventListener('blur',interrupted);document.removeEventListener('visibilitychange',interrupted);};
}
