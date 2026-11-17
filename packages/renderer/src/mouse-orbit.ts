import {PerspectiveCamera, Spherical} from 'three';

/** Mouse orbit with unlimited yaw and a fixed world-up direction. */
export function mouseOrbit(canvas:HTMLCanvasElement,camera:PerspectiveCamera,enabled:()=>boolean,finish:()=>void,changed:()=>void=()=>{}) {
  let pointer:{id:number;x:number;y:number}|undefined;
  const stop=()=>{const p=pointer;pointer=undefined;if(!p)return;finish();if(canvas.hasPointerCapture(p.id))canvas.releasePointerCapture(p.id);};
  const down=(e:PointerEvent)=>{
    if(e.pointerType!=='mouse'||e.button!==2||!enabled())return;
    e.preventDefault();e.stopImmediatePropagation();
    canvas.tabIndex=0;canvas.focus({preventScroll:true});
    pointer={id:e.pointerId,x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);
  };
  const move=(e:PointerEvent)=>{
    if(!pointer||pointer.id!==e.pointerId)return;
    e.preventDefault();e.stopImmediatePropagation();
    if(e.buttons!==2||!enabled()){stop();return;}
    const dx=e.clientX-pointer.x,dy=e.clientY-pointer.y;
    pointer.x=e.clientX;pointer.y=e.clientY;
    const scale=2*Math.PI/Math.max(1,canvas.clientHeight);
    const orbit=new Spherical().setFromVector3(camera.position);
    orbit.theta-=dx*scale;
    orbit.phi=Math.max(0.01,Math.min(Math.PI-0.01,orbit.phi-dy*scale));
    camera.position.setFromSpherical(orbit);camera.up.set(0,1,0);camera.lookAt(0,0,0);
    changed();
  };
  const up=(e:PointerEvent)=>{if(pointer?.id!==e.pointerId)return;e.stopImmediatePropagation();stop();};
  canvas.addEventListener('pointerdown',down,true);canvas.addEventListener('pointermove',move,true);canvas.addEventListener('pointerup',up,true);
  canvas.addEventListener('pointercancel',stop);canvas.addEventListener('lostpointercapture',stop);window.addEventListener('blur',stop);
  return {active:()=>Boolean(pointer),cancel:stop,dispose:()=>{stop();canvas.removeEventListener('pointerdown',down,true);canvas.removeEventListener('pointermove',move,true);canvas.removeEventListener('pointerup',up,true);canvas.removeEventListener('pointercancel',stop);canvas.removeEventListener('lostpointercapture',stop);window.removeEventListener('blur',stop);}};
}
