import {CubeRenderer} from '@rubik/renderer';
import {solvedState} from '@rubik/engine';
import {skinLayout,skinPalette,skinSurface} from './skin-effects.js';
import type {Appearance} from './skin-effects.js';

type Skin=Appearance&{skin_id:string;name:string};
const skins=await fetch('/assets/white-skin-demo.json').then(response=>response.json()) as Skin[];
for(const skin of skins){
  const card=document.createElement('article'),title=document.createElement('h2'),stage=document.createElement('div'),caption=document.createElement('small');
  title.textContent=skin.name;caption.textContent=skin.skin_id;stage.style.height='240px';card.append(title,stage,caption);document.querySelector('#skins')!.append(card);
  const renderer=new CubeRenderer(stage);renderer.setSize(3);renderer.setState(solvedState(3));
  const surface=skinSurface(skin);renderer.setAppearance({...skinLayout(skin),theme:skinPalette(skin),...(surface?{surface}:{})},solvedState(3));
  window.addEventListener('pagehide',()=>renderer.dispose(),{once:true});
}
