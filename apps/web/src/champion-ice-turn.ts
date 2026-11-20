import type {CubeRenderer,MoveSnapshot} from '@rubik/renderer';
import {Group,Vector3} from 'three';
import {prometheusFx} from './prometheus-fx.js';
import {championIceSound} from './champion-design.js';

export function mountChampionIceTurn(renderer:CubeRenderer,enabled:()=>boolean):()=>void {
  const group=new Group();
  const fx=prometheusFx(group,undefined,'ice');
  const cameraPosition=new Vector3();
  let active:MoveSnapshot|undefined;
  const sounds=Array.from({length:3},()=>{
    const sound=new Audio(championIceSound);
    sound.preload='auto';
    return sound;
  });
  let nextSound=0;
  const detach=renderer.attachTurnEffect(group,(frame,camera,time)=>{
    if(!enabled()){
      if(fx.turnActive)fx.clear();
      active=undefined;
      return false;
    }
    if(frame&&active!==frame.turn){
      active=frame.turn;
      group.scale.setScalar(frame.halfEdge/1.5);
      camera.getWorldPosition(cameraPosition);
      group.worldToLocal(cameraPosition);
      fx.turn(frame.turn.move,time,cameraPosition,2,frame.targetAngle);
      const sound=sounds[nextSound]!;
      nextSound=(nextSound+1)%sounds.length;
      sound.currentTime=0;
      void sound.play().catch(()=>{});
    }
    if(fx.turnActive)fx.update(time);
    return fx.turnActive;
  });
  return ()=>{
    detach();fx.dispose();sounds.forEach(sound=>sound.pause());
  };
}
