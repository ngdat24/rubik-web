import type {CubeRenderer,MoveSnapshot} from '@rubik/renderer';
import {Group,Vector3} from 'three';
import {prometheusFx} from './prometheus-fx.js';

export function mountChampionIceTurn(renderer:CubeRenderer,enabled:()=>boolean):()=>void {
  const group=new Group();
  const fx=prometheusFx(group);
  const cameraPosition=new Vector3();
  let active:MoveSnapshot|undefined;
  let audio:AudioContext|undefined,noise:AudioBuffer|undefined;
  function play(duration:number):void {
    try {
      audio??=new AudioContext();
      if(audio.state!=='running')void audio.resume().catch(()=>{});
      if(!noise){
        noise=audio.createBuffer(1,Math.ceil(audio.sampleRate*.15),audio.sampleRate);
        const samples=noise.getChannelData(0);
        for(let i=0;i<samples.length;i++)samples[i]=Math.random()*2-1;
      }
      const seconds=Math.min(.14,Math.max(.035,duration/1000));
      const start=audio.currentTime;
      const source=audio.createBufferSource(), filter=audio.createBiquadFilter(), gain=audio.createGain();
      source.buffer=noise;filter.type='bandpass';filter.Q.value=.65;
      filter.frequency.setValueAtTime(3600,start);
      filter.frequency.exponentialRampToValueAtTime(1900,start+seconds);
      gain.gain.setValueAtTime(.001,start);
      gain.gain.linearRampToValueAtTime(.085,start+seconds*.23);
      gain.gain.exponentialRampToValueAtTime(.001,start+seconds);
      source.connect(filter).connect(gain).connect(audio.destination);
      source.start(start);source.stop(start+seconds);
    }catch{/* Audio may be disabled by the browser. */}
  }
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
      play(renderer.turnDuration(Math.abs(frame.targetAngle)>Math.PI/2));
    }
    if(fx.turnActive)fx.update(time);
    return fx.turnActive;
  });
  return ()=>{
    detach();fx.dispose();void audio?.close().catch(()=>{});
  };
}
