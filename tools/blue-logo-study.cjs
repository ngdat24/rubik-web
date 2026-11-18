const fs=require('fs');
const {chromium}=require('@playwright/test');
(async()=>{const browser=await chromium.launch({channel:'chrome'});try{const page=await browser.newPage();await page.goto('http://127.0.0.1:5205/blue-skins.html');
const skins=JSON.parse(fs.readFileSync('apps/web/public/assets/blue-skin-demo.json','utf8'));
for(const skin of skins){const result=await page.evaluate(async skin=>{
  const load=async url=>{const image=new Image();image.src=url;await image.decode();return image;};
  const [logo,base]=await Promise.all([load('/assets/skins/rank_gold_apex_chrono_01/frame_logo.png'),load(skin.layers.layer_1_base.texture_maps.U)]);
  const canvas=()=>{const c=document.createElement('canvas');c.width=c.height=512;return c;};
  const original=canvas(),oc=original.getContext('2d');oc.drawImage(logo,0,0,512,512);const data=oc.getImageData(0,0,512,512).data;let left=512,right=0,top=512,bottom=0;
  for(let y=0;y<512;y++)for(let x=0;x<512;x++)if(data[(y*512+x)*4+3]>80){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
  const factor=281.6/Math.max(right-left+1,bottom-top+1),w=(right-left+1)*factor,h=(bottom-top+1)*factor,x=(512-w)/2,y=(512-h)/2;
  const mask=canvas(),mc=mask.getContext('2d');mc.drawImage(original,left,top,right-left+1,bottom-top+1,x,y,w,h);mc.globalCompositeOperation='source-in';mc.fillStyle='white';mc.fillRect(0,0,512,512);
  const output=canvas(),ctx=output.getContext('2d');ctx.drawImage(base,0,0,512,512);const rgb=parseInt(skin.layers.layer_1_base.face_colors.U.slice(1),16),pixels=ctx.getImageData(0,0,512,512);
  for(let i=0;i<pixels.data.length;i+=4){pixels.data[i]*=(rgb>>16&255)/255;pixels.data[i+1]*=(rgb>>8&255)/255;pixels.data[i+2]*=(rgb&255)/255;}ctx.putImageData(pixels,0,0);
  ctx.shadowColor='#4c2b1777';ctx.shadowBlur=3;ctx.shadowOffsetY=2;ctx.drawImage(mask,0,0);ctx.shadowColor='transparent';ctx.drawImage(original,left,top,right-left+1,bottom-top+1,x,y,w,h);
  const height=canvas(),hc=height.getContext('2d');hc.fillStyle='#505050';hc.fillRect(0,0,512,512);hc.filter='blur(1.8px)';hc.drawImage(mask,0,0);
  const metal=canvas(),met=metal.getContext('2d');met.fillStyle='black';met.fillRect(0,0,512,512);met.drawImage(mask,0,0);
  const rough=canvas(),rc=rough.getContext('2d');rc.fillStyle='white';rc.fillRect(0,0,512,512);const dark=canvas(),dc=dark.getContext('2d');dc.drawImage(mask,0,0);dc.globalCompositeOperation='source-in';dc.fillStyle='#555555';dc.fillRect(0,0,512,512);rc.drawImage(dark,0,0);
  return {center_gold_ds:output.toDataURL(),center_gold_height:height.toDataURL(),center_gold_metalness:metal.toDataURL(),center_gold_roughness:rough.toDataURL()};
},skin);for(const [name,url]of Object.entries(result))fs.writeFileSync('apps/web/public/assets/skins/'+skin.skin_id+'/'+name+'.png',Buffer.from(url.split(',')[1],'base64'));}
console.log('Seven gold DS centre textures and relief/material masks generated.');
}finally{await browser.close();}})().catch(error=>{console.error(error);process.exit(1);});
