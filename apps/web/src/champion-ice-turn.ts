import type {CubeRenderer,MoveSnapshot} from '@rubik/renderer';
import {BufferGeometry,Color,DoubleSide,Float32BufferAttribute,Group,Mesh,MeshBasicMaterial,Vector3} from 'three';

function iceGeometry(): BufferGeometry {
  const positions:number[]=[];
  const colors:number[]=[];
  const blue=new Color('#1686db'), ice=new Color('#a4e0ff'), edge=new Color('#30679d');
  type Point=[angle:number,height:number,radius:number];
  const vertex=([angle,height,radius]:Point,color:Color)=>{
    const distance=radius+.11;
    positions.push(Math.cos(angle)*distance,height,-Math.sin(angle)*distance);
    colors.push(color.r,color.g,color.b);
  };
  const triangle=(a:Point,b:Point,c:Point,outer:Color,inner:Color)=>{
    vertex(a,outer);vertex(b,inner);vertex(c,outer);
  };
  for(let i=0;i<18;i++){
    const u=i/18,v=(i+1)/18;
    const width=(t:number)=>.048*Math.sin(Math.PI*t);
    const a=-.92*u,b=-.92*v;
    triangle([a,-width(u),1.10],[a,0,1.11],[b,-width(v),1.10],blue,ice);
    triangle([a,0,1.11],[b,-width(v),1.10],[b,0,1.11],ice,blue);
    triangle([a,width(u),1.10],[a,0,1.11],[b,width(v),1.10],edge,ice);
    triangle([a,0,1.11],[b,width(v),1.10],[b,0,1.11],ice,edge);
  }
  const shards=[
    [-.09,.097,.085],[-.18,-.084,.09],[-.30,.144,.065],[-.42,-.130,.11],
    [-.54,.086,.13],[-.65,-.075,.07],[-.78,.116,.10],[-.93,-.093,.065],
  ];
  for(const [angle,height,length] of shards as [number,number,number][]){
    const a:Point=[angle+length*.5,height,1.115];
    const b:Point=[angle,height+length*.26,1.13];
    const c:Point=[angle-length*.5,height-length*.12,1.105];
    const d:Point=[angle-.01,height-length*.22,1.12];
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
  const detach=renderer.attachTurnEffect(seam,(frame,camera)=>{
    if(!frame||!enabled()){
      seam.visible=false;active=undefined;return;
    }
    if(active!==frame.turn){
      active=frame.turn;
      seam.quaternion.setFromUnitVectors(up,axis.set(...frame.axis));
      seam.scale.setScalar(frame.halfEdge);
      camera.getWorldPosition(cameraPosition);
      seam.worldToLocal(cameraPosition);
      const direction=Math.sign(frame.targetAngle-frame.angle)||1;
      origin=Math.atan2(-cameraPosition.z,cameraPosition.x)
        -(frame.angle+frame.targetAngle)/2+direction*.38;
      ribbon.scale.z=direction;
      play(renderer.turnDuration(Math.abs(frame.targetAngle)>Math.PI/2));
    }
    seam.visible=!reducedMotion.matches;
    ribbon.rotation.y=origin+frame.angle;
    material.opacity=.72*Math.min(1,frame.progress*5,(1-frame.progress)*6);
  });
  return ()=>{
    detach();geometry.dispose();material.dispose();void audio?.close().catch(()=>{});
  };
}
