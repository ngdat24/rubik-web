import {CircleGeometry,Color,ExtrudeGeometry,LinearSRGBColorSpace,Mesh,MeshBasicMaterial,MeshNormalMaterial,NoToneMapping,OrthographicCamera,Scene,ShaderMaterial,SRGBColorSpace,WebGLRenderer} from 'three';
import type {BufferGeometry,Shape} from 'three';
import {bronzeRelief,sacredFlame} from './prometheus-ornaments.js';
import {flatFlameMaterial,paletteUniforms} from './prometheus-palette.js';
import {prometheus as config} from './prometheus-config.js';

/** Local authoring bake: all channels use the SAME contours and orthographic UVs. */
export function bakePrometheusAssets(shape:(tile:number,round:number)=>Shape,round:number){
  const renderer=new WebGLRenderer({antialias:true,preserveDrawingBuffer:true,alpha:false});
  renderer.setPixelRatio(1);renderer.toneMapping=NoToneMapping;
  const scene=new Scene(),camera=new OrthographicCamera(-1.5,1.5,1.5,-1.5,.1,10);camera.position.z=5;
  const quartz=new MeshBasicMaterial(),bronze=new MeshBasicMaterial({color:config.bronze.color});
  const normal=new MeshNormalMaterial();
  const height=new ShaderMaterial({vertexShader:'varying float h;void main(){h=position.z;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:'varying float h;void main(){float v=clamp((h-.057)/.021,0.,1.);gl_FragColor=vec4(vec3(v),1.);}'});
  // Height uses world Z so the relief's .059 elevation is included as well.
  height.vertexShader='varying float h;void main(){vec4 world=modelMatrix*vec4(position,1.);h=world.z;gl_Position=projectionMatrix*viewMatrix*world;}';
  const white=new MeshBasicMaterial({color:0xffffff});
  const diskMaterial=new MeshBasicMaterial(),flameMaterial=flatFlameMaterial(config.faceFlames[0]);
  const caps:Mesh[]=[],geometry:BufferGeometry[]=[];
  const disk=new Mesh(new CircleGeometry(.325,64),diskMaterial);disk.position.z=.064;geometry.push(disk.geometry);
  const star=new Mesh(new ExtrudeGeometry(sacredFlame(.275),{depth:.006,bevelSize:.002,bevelThickness:.002,bevelSegments:2}),flameMaterial);star.position.z=.070;geometry.push(star.geometry);
  for(let tile=0;tile<9;tile++){
    const outline=shape(tile,round),capGeometry=new ExtrudeGeometry(outline,{depth:.045,bevelEnabled:true,bevelSize:.009,bevelThickness:.012,bevelSegments:3,steps:1,curveSegments:12});
    const reliefGeometry=bronzeRelief(tile,outline);geometry.push(capGeometry,reliefGeometry);
    const cap=new Mesh(capGeometry,quartz),relief=new Mesh(reliefGeometry,bronze);
    cap.position.set(tile%3-1,1-Math.floor(tile/3),0);relief.position.set(cap.position.x,cap.position.y,.065);
    scene.add(cap,relief);caps.push(cap);
  }
  scene.add(disk,star);
  const output:Record<string,string>={},faces=['u','r','f','d','l','b'];
  const pixels=()=>{const bytes=new Uint8Array(renderer.domElement.width*renderer.domElement.height*4);renderer.getContext().readPixels(0,0,renderer.domElement.width,renderer.domElement.height,renderer.getContext().RGBA,renderer.getContext().UNSIGNED_BYTE,bytes);return bytes;};
  const save=(name:string)=>{output[name]=renderer.domElement.toDataURL('image/png');};
  const canvasMap=(size:number,name:string,draw:(data:Uint8ClampedArray)=>void)=>{
    const canvas=document.createElement('canvas');canvas.width=canvas.height=size;const ctx=canvas.getContext('2d')!,image=ctx.createImageData(size,size);draw(image.data);ctx.putImageData(image,0,0);output[name]=canvas.toDataURL('image/png');
  };
  try{
    for(const size of [512,1024]){
      renderer.setSize(size,size,false);const suffix=size===512?'':'_1024';
      renderer.outputColorSpace=SRGBColorSpace;scene.overrideMaterial=null;scene.background=new Color(0x2b090e);
      faces.forEach((face,i)=>{
        quartz.color.setHex(config.colors[i]!);diskMaterial.color.setHex(config.colors[i]!).multiplyScalar(.12);
        Object.assign(flameMaterial.uniforms,paletteUniforms(config.faceFlames[i]!));
        renderer.render(scene,camera);save('albedo_'+face+suffix+'.png');
      });
      renderer.outputColorSpace=LinearSRGBColorSpace;scene.overrideMaterial=normal;scene.background=new Color().setRGB(.5,.5,1);
      renderer.render(scene,camera);save('normal'+suffix+'.png');
      scene.overrideMaterial=height;scene.background=new Color(0);renderer.render(scene,camera);save('height'+suffix+'.png');const heights=pixels();
      scene.overrideMaterial=white;renderer.render(scene,camera);const mask=pixels();
      // One shared monochrome emission mask; the runtime supplies all six color ramps.
      const flameMaskScene=new Scene(),flameMask=new Mesh(star.geometry,white);flameMask.position.copy(star.position);flameMaskScene.add(flameMask);
      flameMaskScene.background=new Color(0);renderer.render(flameMaskScene,camera);const flamePixels=pixels();
      const at=(x:number,y:number)=>((size-1-Math.max(0,Math.min(size-1,y)))*size+Math.max(0,Math.min(size-1,x)))*4;
      canvasMap(size,'roughness'+suffix+'.png',data=>{
        for(let y=0;y<size;y++)for(let x=0;x<size;x++){
          const src=at(x,y),dst=(y*size+x)*4,v=mask[src]!<128?.68:heights[src]!>90?.22:.06;
          data[dst]=data[dst+1]=data[dst+2]=Math.round(v*255);data[dst+3]=255;
        }
      });
      canvasMap(size,'ao'+suffix+'.png',data=>{
        const radius=size===1024?4:2;
        for(let y=0;y<size;y++)for(let x=0;x<size;x++){
          const here=heights[at(x,y)]!/255;let occlusion=0;
          for(const [dx,dy] of [[radius,0],[-radius,0],[0,radius],[0,-radius]])occlusion+=Math.max(0,heights[at(x+dx!,y+dy!)]!/255-here);
          const dst=(y*size+x)*4,v=Math.round(255*(1-Math.min(.5,occlusion*.22)));
          data[dst]=data[dst+1]=data[dst+2]=v;data[dst+3]=255;
        }
      });
      canvasMap(size,'emissive_mask'+suffix+'.png',data=>{
        const radius=size===1024?2:1;
        for(let y=0;y<size;y++)for(let x=0;x<size;x++){
          const dst=(y*size+x)*4,inside=mask[at(x,y)]!>128;
          const edge=inside&&[[radius,0],[-radius,0],[0,radius],[0,-radius]].some(([dx,dy])=>mask[at(x+dx!,y+dy!)]!<128);
          const value=Math.max(flamePixels[at(x,y)]!,edge?190:0);
          data[dst]=data[dst+1]=data[dst+2]=value;data[dst+3]=255;
        }
      });
    }
    canvasMap(512,'core_inner_normal.png',data=>{
      for(let y=0;y<512;y++)for(let x=0;x<512;x++){
        const line=Math.sin(x*.13+Math.sin(y*.042)*2),slope=Math.cos(x*.13+Math.sin(y*.042)*2)*.24;
        const length=Math.hypot(slope,line*.05,1),i=(y*512+x)*4;
        data[i]=Math.round((slope/length*.5+.5)*255);data[i+1]=Math.round((line*.05/length*.5+.5)*255);data[i+2]=Math.round((1/length*.5+.5)*255);data[i+3]=255;
      }
    });
    return output;
  }finally{geometry.forEach(g=>g.dispose());[quartz,bronze,normal,height,white,diskMaterial,flameMaterial].forEach(m=>m.dispose());renderer.dispose();renderer.forceContextLoss();}
}
