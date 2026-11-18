import type {PerspectiveCamera} from 'three';
import {prometheus as config} from './prometheus-config.js';

/** Supplied glass-clink turn sample; completion gong retains its procedural voice. */
export function prometheusAudio(){
  let context:AudioContext|undefined,master:GainNode|undefined,loop:GainNode|undefined,loopSource:AudioBufferSourceNode|undefined;
  let enabled=true,disposed=false,inputs:number[]=[];
  let turnSample:AudioBuffer|undefined,sampleOffset=0;
  let solveSample:AudioBuffer|undefined;
  const sampleRequest=new AbortController();
  const sampleReady=fetch('/assets/fx/sounds/sound_prometheus_divine_s1/turn-glass.mp3',{signal:sampleRequest.signal})
    .then(response=>{if(!response.ok)throw Error('Turn sample unavailable');return response.arrayBuffer();})
    .then(bytes=>new OfflineAudioContext(1,1,44100).decodeAudioData(bytes))
    .then(buffer=>{if(disposed)return;turnSample=buffer;
      const data=buffer.getChannelData(0);let index=0;while(index<data.length&&Math.abs(data[index]!)<.008)index++;
      sampleOffset=Math.max(0,index/buffer.sampleRate-.005);
    }).catch(()=>{/* Keep procedural fallback if the local sample fails to load. */});
  const solveReady=fetch('/assets/fx/sounds/sound_prometheus_divine_s1/solve-crystal-layer.mp3',{signal:sampleRequest.signal})
    .then(response=>{if(!response.ok)throw Error('Solve layer unavailable');return response.arrayBuffer();})
    .then(bytes=>new OfflineAudioContext(1,1,44100).decodeAudioData(bytes))
    .then(buffer=>{if(!disposed)solveSample=buffer;}).catch(()=>{/* The original gong still plays. */});
  let voices:{end:number;stop:()=>void}[]=[];
  function init(){
    if(disposed||!enabled||!window.AudioContext)return;
    context??=new AudioContext();
    if(!master){master=context.createGain();master.gain.value=.19;master.connect(context.destination);}
    void context.resume().catch(()=>{});return context;
  }
  function noise(ctx:AudioContext,seconds:number){
    const buffer=ctx.createBuffer(1,Math.ceil(ctx.sampleRate*seconds),ctx.sampleRate),data=buffer.getChannelData(0);
    let b0=0,b1=0,b2=0;
    for(let i=0;i<data.length;i++){
      const white=Math.random()*2-1;b0=.99765*b0+white*.099046;b1=.963*b1+white*.2965164;b2=.57*b2+white*1.0526913;
      data[i]=(b0+b1+b2+white*.1848)*.12;
    }
    return buffer;
  }
  function sound(move:string,complete=false){
    const ctx=init();if(!ctx||!master)return;
    const now=ctx.currentTime;
    voices=voices.filter(v=>v.end>now);
    while(voices.length>=config.audio.polyphony)voices.shift()!.stop();
    const panner=ctx.createPanner();panner.panningModel='HRTF';panner.distanceModel='inverse';panner.refDistance=1;panner.rolloffFactor=1.2;
    const face=(/[URFDLB]/.exec(move)?.[0]??'U') as keyof typeof config.audio.offsets;
    const [x,y,z]=complete?[0,0,0]:config.audio.offsets[face];
    panner.positionX.value=x!;panner.positionY.value=y!;panner.positionZ.value=z!;panner.connect(master);
    const sources:(OscillatorNode|AudioBufferSourceNode)[]=[],gains:GainNode[]=[],filters:BiquadFilterNode[]=[];
    const rate=move.includes("'")?config.audio.ccwRate:config.audio.cwRate;
    const tone=(hz:number,endHz:number,delay:number,decay:number,type:OscillatorType,level:number)=>{
      const source=ctx.createOscillator(),gain=ctx.createGain();source.type=type;
      source.frequency.setValueAtTime(hz*rate,now+delay);source.frequency.exponentialRampToValueAtTime(endHz*rate,now+delay+decay);
      source.detune.value=(Math.random()*2-1)*config.audio.detune;
      gain.gain.setValueAtTime(level,now+delay);gain.gain.exponentialRampToValueAtTime(.0001,now+delay+decay);
      source.connect(gain).connect(panner);source.start(now+delay);source.stop(now+delay+decay+.01);sources.push(source);gains.push(gain);
    };
    const duration=complete?(solveSample?3.55:3.2):turnSample?(turnSample.duration-sampleOffset)/rate:.20;
    if(complete){
      tone(155,151,0,3.2,'sine',.8);tone(310,303,.02,2.7,'sine',.22);tone(427.18,420,.04,2.4,'sine',.12);
      if(solveSample){
        const source=ctx.createBufferSource(),gain=ctx.createGain(),high=ctx.createBiquadFilter(),low=ctx.createBiquadFilter();source.buffer=solveSample;
        high.type='highpass';high.frequency.value=750;high.Q.value=.7;low.type='lowpass';low.frequency.value=7200;low.Q.value=.7;
        // Leave room for the gong attack; crystal peaks at full opening (1.3s),
        // then fades before the 3.6s bloom finishes. Preserve the sample's pitch.
        gain.gain.setValueAtTime(0,now+.20);gain.gain.linearRampToValueAtTime(.045,now+.65);
        gain.gain.linearRampToValueAtTime(.18,now+1.3);gain.gain.linearRampToValueAtTime(.10,now+2.35);
        gain.gain.linearRampToValueAtTime(0,now+3.55);
        source.connect(high).connect(low).connect(gain).connect(panner);source.start(now+.20,.30);source.stop(now+3.55);
        sources.push(source);gains.push(gain);filters.push(high,low);
      }
    }
    else if(turnSample){
      inputs.push(performance.now());
      const source=ctx.createBufferSource(),gain=ctx.createGain();source.buffer=turnSample;source.playbackRate.value=rate;
      gain.gain.setValueAtTime(0,now);gain.gain.linearRampToValueAtTime(1,now+.005);
      gain.gain.setValueAtTime(1,now+Math.max(.005,duration-.06));gain.gain.linearRampToValueAtTime(0,now+duration);
      source.connect(gain).connect(panner);source.start(now,sampleOffset);source.stop(now+duration);sources.push(source);gains.push(gain);
    }
    else{
      inputs.push(performance.now());
      tone(1480,420,0,.018,'triangle',.42);tone(310,310,.015,.085,'sine',.32);tone(310*2.756,310*2.756,.015,.085,'sine',.10);
      const rush=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),gain=ctx.createGain();
      rush.buffer=noise(ctx,.16);filter.type='bandpass';filter.frequency.value=680;filter.Q.value=1.4;
      gain.gain.setValueAtTime(.001,now+.035);gain.gain.linearRampToValueAtTime(.46,now+.055);gain.gain.exponentialRampToValueAtTime(.0001,now+.195);
      rush.connect(filter).connect(gain).connect(panner);rush.start(now+.035);sources.push(rush);gains.push(gain);
    }
    let cleaned=false;
    const stop=()=>{if(cleaned)return;cleaned=true;for(const source of sources){try{source.stop();}catch{/* Already ended. */}source.disconnect();}gains.forEach(g=>g.disconnect());filters.forEach(f=>f.disconnect());panner.disconnect();};
    (complete&&!solveSample?sources[0]!:sources.at(-1)!).onended=stop;
    voices.push({end:now+duration,stop});
  }
  return {
    ready:Promise.all([sampleReady,solveReady]),
    turn:(move:string)=>sound(move),solve:()=>sound('U',true),
    setEnabled(value:boolean){enabled=value;if(!value){inputs=[];voices.forEach(v=>v.stop());voices=[];if(loop&&context)loop.gain.setTargetAtTime(0,context.currentTime,.04);}},
    update(camera:PerspectiveCamera,now:number){
      if(!context||!master)return;
      camera.updateMatrixWorld();
      const e=camera.matrixWorld.elements,listener=context.listener;
      listener.positionX.value=camera.position.x/3;listener.positionY.value=camera.position.y/3;listener.positionZ.value=camera.position.z/3;
      listener.forwardX.value=-e[8]!;listener.forwardY.value=-e[9]!;listener.forwardZ.value=-e[10]!;
      listener.upX.value=e[4]!;listener.upY.value=e[5]!;listener.upZ.value=e[6]!;
      inputs=inputs.filter(t=>now-t<1000);
      if(!turnSample&&enabled&&inputs.length>config.audio.tpsThreshold&&!loop){
        loop=context.createGain();loop.gain.value=0;loopSource=context.createBufferSource();loopSource.buffer=noise(context,1);loopSource.loop=true;
        const filter=context.createBiquadFilter();filter.type='bandpass';filter.frequency.value=680;filter.Q.value=1.4;
        loopSource.connect(filter).connect(loop).connect(master);loopSource.start();
      }
      if(loop)loop.gain.setTargetAtTime(!turnSample&&enabled&&inputs.length>config.audio.tpsThreshold ? .35 : 0,context.currentTime,inputs.length>4.5 ? .08 : .22);
    },
    dispose(){disposed=true;sampleRequest.abort();turnSample=undefined;solveSample=undefined;voices.forEach(v=>v.stop());loopSource?.stop();void context?.close().catch(()=>{});}
  };
}
