import {CubeRenderer} from '@rubik/renderer';
import {solvedState} from '@rubik/engine';
import {skinLayout,skinPalette,skinSurface} from './skin-effects.js';
import type {Appearance} from './skin-effects.js';

type Skin=Appearance&{skin_id:string;name:string};
const skins=await fetch('/assets/blue-skin-demo.json').then(response=>response.json()) as Skin[];
const blueStudies:CubeRenderer[]=[];
if(import.meta.env.DEV)Object.defineProperty(window,'blueSkinStudy',{value:blueStudies,configurable:true});
for(const skin of skins){
  const card=document.createElement('article'),title=document.createElement('h2'),stage=document.createElement('div'),caption=document.createElement('small');
  title.textContent=skin.name;caption.textContent=skin.skin_id;stage.style.height='360px';card.append(title,stage,caption);document.querySelector('#skins')!.append(card);
  const renderer=new CubeRenderer(stage);renderer.setSize(3);renderer.setState(solvedState(3));
  blueStudies.push(renderer);
  const surface=skinSurface(skin);renderer.setAppearance({...skinLayout(skin),fillLightIntensity:.8,theme:skinPalette(skin),...(surface?{surface}:{})},solvedState(3));
  renderer.zoomBy(.8);
  const controls=document.createElement('div');controls.className='views';
  for(const [name,view]of [['Mặt trắng / xanh / đỏ','ufr'],['Ba mặt còn lại','dbl']] as const){const button=document.createElement('button');button.textContent=name;button.onclick=()=>{renderer.setCameraView(view);renderer.zoomBy(.8);};controls.append(button);}card.append(controls);
  window.addEventListener('pagehide',()=>renderer.dispose(),{once:true});
}

