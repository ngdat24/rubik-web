import type {CubeRenderer,MoveSnapshot} from '@rubik/renderer';
import {BufferGeometry,Color,DoubleSide,Float32BufferAttribute,Group,Mesh,MeshBasicMaterial,Vector3} from 'three';

function iceGeometry(): BufferGeometry {
  const positions:number[]=[];
  const colors:number[]=[];
  const blue=new Color('#229aff'), ice=new Color('#ccf2ff'), edge=new Color('#397cc4');
  type Point=[angle:number,height:number,radius:number];
  const vertex=([angle,height,radius]:Point,color:Color)=>{
    const distance=radius+.23;
    positions.push(Math.cos(angle)*distance,height,-Math.sin(angle)*distance);
    colors.push(color.r,color.g,color.b);
  };
  const triangle=(a:Point,b:Point,c:Point,outer:Color,inner:Color)=>{
    vertex(a,outer);vertex(b,inner);vertex(c,outer);
  };
  for(let i=0;i<18;i++){
    const u=i/18,v=(i+1)/18;
    const width=(t:number)=>.15*Math.sin(Math.PI*t);
    const a=-Math.PI*.57*u,b=-Math.PI*.57*v;
    triangle([a,-width(u),1.16-width(u)],[a,0,1.16],[b,-width(v),1.16-width(v)],blue,ice);
    triangle([a,0,1.16],[b,-width(v),1.16-width(v)],[b,0,1.16],ice,blue);
    triangle([a,width(u),1.16+width(u)],[a,0,1.16],[b,width(v),1.16+width(v)],edge,ice);
    triangle([a,0,1.16],[b,width(v),1.16+width(v)],[b,0,1.16],ice,edge);
  }
  const shards=[
    [-.15,.125,.11],[-.31,-.14,.13],[-.47,.19,.09],[-.64,-.17,.14],
    [-.82,.135,.14],[-1.07,-.13,.10],[-1.32,.15,.12],[-1.65,-.13,.08],
  ];
  for(const [angle,height,length] of shards as [number,number,number][]){
    const a:Point=[angle+length*.5,height,1.22];
    const b:Point=[angle,height+length*.26,1.26];
    const c:Point=[angle-length*.5,height-length*.12,1.21];
    const d:Point=[angle-.01,height-length*.22,1.23];
    triangle(a,b,c,blue,ice);triangle(a,d,c,edge,blue);
  }
  const geometry=new BufferGeometry();
  geometry.setAttribute('position',new Float32BufferAttribute(positions,3));
  geometry.setAttribute('color',new Float32BufferAttribute(colors,3));
  return geometry;
}

export function mountChampionIceTurn(renderer:CubeRenderer,enabled:()=>boolean):()=>void {
  const geometry=iceGeometry();
  const material=new MeshBasicMaterial({vertexColors:true,side:DoubleSide,transparent:true,depthWrite:false});
  const ribbon=new Mesh(geometry,material), seam=new Group();
  seam.add(ribbon);
  seam.visible=false;
  const up=new Vector3(0,1,0),axis=new Vector3(),cameraPosition=new Vector3();
  const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
  let active:MoveSnapshot|undefined;
  let origin=0;
  let started=0,duration=0,startAngle=0,sweep=0;
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
  const detach=renderer.attachTurnEffect(seam,(frame,camera,time)=>{
    if(!enabled()){
      seam.visible=false;active=undefined;return false;
    }
    if(frame&&active!==frame.turn){
      active=frame.turn;
      seam.quaternion.setFromUnitVectors(up,axis.set(...frame.axis));
      seam.scale.setScalar(frame.halfEdge);
      camera.getWorldPosition(cameraPosition);
      seam.worldToLocal(cameraPosition);
      started=time;
      startAngle=frame.angle;
      sweep=frame.targetAngle-startAngle;
      const doubleTurn=Math.abs(frame.targetAngle)>Math.PI/2;
      const moveDuration=renderer.turnDuration(doubleTurn);
      // Like Prometheus, the trail remains readable after a fast cube turn.
      duration=Math.max(doubleTurn?320:260,moveDuration);
      const direction=Math.sign(sweep)||1;
      origin=Math.atan2(-cameraPosition.z,cameraPosition.x)-startAngle+direction*.56;
      ribbon.scale.z=direction;
      play(moveDuration);
    }
    const progress=(time-started)/duration;
    seam.visible=Boolean(active)&&!reducedMotion.matches&&progress<1;
    if(!seam.visible)return false;
    ribbon.rotation.y=origin+startAngle+sweep*progress;
    material.opacity=.94*(1-progress**2);
    return true;
  });
  return ()=>{
    detach();geometry.dispose();material.dispose();void audio?.close().catch(()=>{});
  };
}
