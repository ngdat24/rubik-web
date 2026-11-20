import type {CubeRenderer,MoveSnapshot} from '@rubik/renderer';
import {buildLayout} from '@rubik/renderer';
import {BufferGeometry,Color,DoubleSide,Float32BufferAttribute,Mesh,MeshBasicMaterial,Vector3} from 'three';

type IcePoint = readonly [along:number, across:number, lift:number];

function iceGeometry() {
  const points:IcePoint[]=[];
  const colors:number[]=[];
  const outline=new Color('#18374e'), blue=new Color('#087de1');
  const light=new Color('#59c8ff'), white=new Color('#ecfbff');
  const facet=(a:IcePoint,b:IcePoint,c:IcePoint,color:Color)=>{
    points.push(a,b,c);
    for(let i=0;i<3;i++)colors.push(color.r,color.g,color.b);
  };

  // Broken, bevelled edges and asymmetric facets give the trail an ice silhouette.
  const widths=[0,.042,.038,.063,.048,.079,.058,.097,.073,.11,.081,.054,0];
  const point=(i:number,width:number,lift:number):IcePoint=>[i/(widths.length-1),widths[i]!*width,lift];
  for(let i=0;i<widths.length-1;i++){
    const j=i+1;
    const a=point(i,-1,.012),b=point(j,-1,.012),c=point(i,.85,.012),d=point(j,.85,.012);
    const e=point(i,-.67,.017),f=point(j,-.67,.017),g=point(i,.62,.017),h=point(j,.62,.017);
    const ridge=point(i,-.12,.032),nextRidge=point(j,-.12,.032);
    facet(a,b,e,outline);facet(e,b,f,outline);
    facet(c,g,d,outline);facet(g,h,d,outline);
    facet(e,f,ridge,blue);facet(ridge,f,nextRidge,i%3===1?white:light);
    facet(ridge,nextRidge,g,i%4===2?white:light);facet(g,nextRidge,h,blue);
  }
  for(const [along,across,length,width] of [
    [.14,-.14,.09,.049],[.26,.12,.11,.055],[.39,-.18,.14,.068],
    [.55,.16,.14,.065],[.7,-.15,.13,.06],[.83,.12,.11,.048],
  ] as const){
    const tip:IcePoint=[along+length/2,across,.03];
    const top:IcePoint=[along-.02,across+width*.58,.03];
    const back:IcePoint=[along-length/2,across-width*.25,.028];
    const bottom:IcePoint=[along+.015,across-width*.58,.03];
    const center:IcePoint=[along,across,.06];
    facet(tip,top,center,light);facet(top,back,center,blue);
    facet(back,bottom,center,outline);facet(bottom,tip,center,white);
  }
  const geometry=new BufferGeometry();
  const position=new Float32BufferAttribute(new Float32Array(points.length*3),3);
  geometry.setAttribute('position',position);
  geometry.setAttribute('color',new Float32BufferAttribute(colors,3));
  return {geometry,position,points};
}

export function mountChampionIceTurn(renderer:CubeRenderer,enabled:()=>boolean):()=>void {
  const {geometry,position,points}=iceGeometry();
  const material=new MeshBasicMaterial({vertexColors:true,side:DoubleSide,transparent:true,depthWrite:false});
  const ribbon=new Mesh(geometry,material);
  ribbon.frustumCulled=false;
  ribbon.visible=false;
  const axis=new Vector3(),cameraPosition=new Vector3(),anchor=new Vector3(),sample=new Vector3();
  const normal=new Vector3(),candidate=new Vector3(),face=new Vector3();
  const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
  let active:MoveSnapshot|undefined;
  let started=0,duration=0,sweep=0,half=1,axisCoordinate=0;
  let onTurningFace=false;
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
  const detach=renderer.attachTurnEffect(ribbon,(frame,camera,time)=>{
    if(!enabled()){
      ribbon.visible=false;active=undefined;return false;
    }
    if(frame&&active!==frame.turn){
      active=frame.turn;
      axis.set(...frame.axis);
      half=frame.halfEdge;
      sweep=frame.targetAngle;
      const slots=buildLayout(2,{edgeLength:2*half}).slots;
      camera.getWorldPosition(cameraPosition);
      let best=-Infinity;
      for(const index of frame.stickerIndices){
        const slot=slots[index];
        if(!slot)continue;
        candidate.set(...slot.position);
        normal.set(...slot.normal);
        // A face parallel to the turn axis never travels around the outside of the layer.
        if(normal.dot(axis)!==0&&index!==frame.dragSticker)continue;
        let score=0;
        for(const phase of [0,.35,.7,1]){
          sample.copy(candidate).applyAxisAngle(axis,sweep*phase);
          face.copy(normal).applyAxisAngle(axis,sweep*phase);
          score+=Math.max(0,face.dot(cameraPosition)-face.dot(sample));
        }
        if(index===frame.dragSticker||score>best){
          best=score;anchor.copy(candidate);
          onTurningFace=normal.dot(axis)!==0;
          if(index===frame.dragSticker)break;
        }
      }
      if(best===-Infinity){ribbon.visible=false;return false;}
      axisCoordinate=anchor.dot(axis);
      anchor.addScaledVector(axis,-axisCoordinate);
      started=time;
      const doubleTurn=Math.abs(sweep)>Math.PI/2;
      const moveDuration=renderer.turnDuration(doubleTurn);
      duration=Math.max(doubleTurn?320:260,moveDuration);
      play(moveDuration);
    }
    const progress=(time-started)/duration;
    ribbon.visible=Boolean(active)&&!reducedMotion.matches&&progress<1;
    if(!ribbon.visible)return false;
    const head=Math.min(1,.20+progress*1.25);
    const tail=Math.max(0,(progress-.73)*1.7);
    for(const [index,[along,across,lift]] of points.entries()){
      const phase=tail+(head-tail)*along;
      sample.copy(anchor).applyAxisAngle(axis,sweep*phase);
      if(onTurningFace){
        const radius=sample.length();
        if(radius)sample.multiplyScalar(1+across*half/radius);
        sample.addScaledVector(axis,axisCoordinate+Math.sign(axisCoordinate)*lift*half);
      }else{
        const extent=Math.max(Math.abs(sample.x),Math.abs(sample.y),Math.abs(sample.z));
        // Follow the cube's square section instead of a circle floating outside it.
        sample.multiplyScalar((half+lift*half)/extent).addScaledVector(axis,axisCoordinate+across*half);
      }
      position.setXYZ(index,sample.x,sample.y,sample.z);
    }
    position.needsUpdate=true;
    material.opacity=.96*(1-Math.max(0,progress-.68)/.32);
    return true;
  });
  return ()=>{
    detach();geometry.dispose();material.dispose();void audio?.close().catch(()=>{});
  };
}
