import {CanvasTexture,SRGBColorSpace} from 'three';
// Pixel rectangles for complete faces in the supplied flat scans. Order U R F D L B.
const rects:number[][][]=[
 [[272,14,181,181],[460,198,120,181],[272,198,181,181],[272,386,181,178],[76,198,187,181],[588,198,195,181]],
 [[8,13,258,258],[276,279,258,258],[8,279,258,258],[276,548,258,258],[276,13,258,258],[8,548,258,258]],
 [[4,7,239,240],[251,260,240,241],[4,260,239,241],[251,514,240,241],[251,7,240,240],[4,514,239,241]],
 [[0,0,257,259],[264,264,258,258],[0,264,257,258],[264,530,258,254],[264,0,258,259],[0,530,257,254]],
 [[278,18,116,116],[402,140,116,116],[278,140,116,116],[278,263,116,116],[157,140,116,116],[522,140,117,116]],
 [[0,8,244,240],[257,271,244,240],[0,271,244,240],[257,534,244,240],[257,8,244,240],[0,534,244,240]],
 [[10,14,240,234],[257,256,240,234],[10,256,240,234],[257,503,240,239],[257,14,240,234],[10,503,240,239]],
 [[0,4,256,254],[260,263,254,254],[0,263,256,254],[260,524,254,254],[260,4,254,254],[0,524,256,254]],
 [[297,21,183,179],[481,204,183,179],[297,204,183,179],[297,386,183,179],[111,204,183,179],[675,204,184,179]]
];
const images=await Promise.all(rects.map(async(_,i)=>{const image=new Image();image.src='/assets/purple-reference/scan-'+i+'.png';await image.decode();return image;}));
const fuji=new Image();fuji.src='/assets/purple-reference/fuji.png';await fuji.decode();
const fujiCanvas=document.createElement('canvas');fujiCanvas.width=fuji.width;fujiCanvas.height=fuji.height;
const fujiContext=fujiCanvas.getContext('2d')!;fujiContext.drawImage(fuji,0,0);
const fujiPixels=fujiContext.getImageData(0,0,fuji.width,fuji.height);
for(let i=0;i<fujiPixels.data.length;i+=4){const r=fujiPixels.data[i]!,g=fujiPixels.data[i+1]!,b=fujiPixels.data[i+2]!;if(Math.min(r,g,b)>220&&Math.max(r,g,b)-Math.min(r,g,b)<12)fujiPixels.data[i+3]=0;}
fujiContext.putImageData(fujiPixels,0,0);
export function referenceTile(kind:number,face:number,tile:number){
 const image=images[kind]!,[x,y,w,h]=rects[kind]![face] as [number,number,number,number];
 const canvas=document.createElement('canvas');canvas.width=canvas.height=384;const c=canvas.getContext('2d')!;
 // Crop within the actual colored tile, excluding scan background and frame.
 const inset=kind===8?.17:kind>=7?.12:.14,tw=w/3,th=h/3;
 const sourceTile=tile===8?2:tile;
 c.drawImage(image,x+(sourceTile%3+inset)*tw,y+(Math.floor(sourceTile/3)+inset)*th,tw*(1-2*inset),th*(1-2*inset),0,0,384,384);
 // A single clean red scale panel avoids the scan seam in the red face.
 if(kind===0&&face===1)c.drawImage(image,469,208,30,45,0,0,384,384);
 // Preserve the metallic center emblem while recoloring its gold ground to the face.
 if(kind===7&&tile===4){
  const palette=['#ece8df','#a52b38','#267359','#b48b1e','#b85824','#244d87'],hex=palette[face]!,n=parseInt(hex.slice(1),16),target=[n>>16&255,n>>8&255,n&255];
  const data=c.getImageData(0,0,384,384);for(let i=0;i<data.data.length;i+=4){const rr=data.data[i]!,gg=data.data[i+1]!,bb=data.data[i+2]!;if(rr>bb*1.2&&gg>bb*1.1){const lum=(rr+gg+bb)/3/150;for(let k=0;k<3;k++)data.data[i+k]=Math.min(255,target[k]!*lum);}}c.putImageData(data,0,0);
 }
 // Correct the substituted lower-right clockwork corner independently.
 if(kind===1&&tile===8){const rotated=document.createElement('canvas');rotated.width=rotated.height=384;rotated.getContext('2d')!.drawImage(canvas,0,0);c.save();c.translate(192,192);c.rotate(Math.PI/2);c.drawImage(rotated,-192,-192);c.restore();}
 // Match the yellow ground to the Spanish gold without flattening engraving.
 if([0,1,2,4,7].includes(kind)&&face===3){
  const data=c.getImageData(0,0,384,384);let sum=0,count=0;
  for(let i=0;i<data.data.length;i+=4){sum+=data.data[i]!*.2126+data.data[i+1]!*.7152+data.data[i+2]!*.0722;count++;}
  const gain=132/(sum/count);
  for(let i=0;i<data.data.length;i+=4){const l=(data.data[i]!*.2126+data.data[i+1]!*.7152+data.data[i+2]!*.0722)*gain;data.data[i]=Math.min(255,l*1.23);data.data[i+1]=Math.min(255,l*.99);data.data[i+2]=Math.min(255,l*.43);}
  c.putImageData(data,0,0);
 }
 // Rebuild UK center on a clean matching ground; keep only the gilded emblem.
 if(kind===8&&tile===4){
  const original=c.getImageData(0,0,384,384),mask=document.createElement('canvas');mask.width=mask.height=384;
  let minX=384,minY=384,maxX=0,maxY=0;
  for(let yy=0;yy<384;yy++)for(let xx=0;xx<384;xx++){const i=(yy*384+xx)*4,r=original.data[i]!,g=original.data[i+1]!,b=original.data[i+2]!;
   const gold=r>b*1.22&&g>b*1.12&&r>85&&xx>45&&xx<339&&yy>45&&yy<339;
   if(!gold)original.data[i+3]=0;else{minX=Math.min(minX,xx);maxX=Math.max(maxX,xx);minY=Math.min(minY,yy);maxY=Math.max(maxY,yy);}
  }
  mask.getContext('2d')!.putImageData(original,0,0);
  const cleanTile=1;c.drawImage(image,x+(cleanTile%3+inset)*tw,y+(Math.floor(cleanTile/3)+inset)*th,tw*(1-2*inset),th*(1-2*inset),0,0,384,384);
  if(maxX>minX&&maxY>minY){const width=maxX-minX+1,height=maxY-minY+1,scale=211/Math.max(width,height);c.drawImage(mask,minX,minY,width,height,(384-width*scale)/2,(384-height*scale)/2,width*scale,height*scale);}
 }
 // Imperial jade green follows the Spanish emerald hue, retaining bamboo relief.
 if((kind===6||kind===2)&&face===2){
  const data=c.getImageData(0,0,384,384);let total=0;
  for(let i=0;i<data.data.length;i+=4)total+=data.data[i]!*.2126+data.data[i+1]!*.7152+data.data[i+2]!*.0722;
  const average=total/(384*384);
  for(let i=0;i<data.data.length;i+=4){const l=data.data[i]!*.2126+data.data[i+1]!*.7152+data.data[i+2]!*.0722,shade=Math.max(.35,1+(l-average)/105);data.data[i]=38*shade;data.data[i+1]=115*shade;data.data[i+2]=89*shade;if(kind===2){const frost=Math.max(0,Math.min(.85,(l-average-12)/65));for(let k=0;k<3;k++)data.data[i+k]=data.data[i+k]!*(1-frost)+240*frost;}}
  c.putImageData(data,0,0);
 }
 if(kind===1&&face===5){
  const data=c.getImageData(0,0,384,384);
  for(let i=0;i<data.data.length;i+=4){const r=data.data[i]!,g=data.data[i+1]!,b=data.data[i+2]!;if(b>r*1.12&&b>g*1.12){data.data[i]=Math.min(255,r*1.22+9);data.data[i+1]=Math.min(255,g*1.2+12);data.data[i+2]=Math.min(255,b*1.16+16);}}
  c.putImageData(data,0,0);
 }
 if(kind===5&&face===0){
  c.fillStyle='#e9eaf0';c.fillRect(0,0,384,384);
  c.save();c.globalAlpha=.37;
  c.drawImage(fujiCanvas,tile%3*fuji.width/3,Math.floor(tile/3)*fuji.height/3,fuji.width/3,fuji.height/3,0,0,384,384);
  c.restore();
 }
  // A mild local contrast pass improves scan legibility without changing its palette.
 const detail=c.getImageData(0,0,384,384),source=new Uint8ClampedArray(detail.data);
 for(let y=1;y<383;y++)for(let x=1;x<383;x++){const i=(y*384+x)*4;for(let k=0;k<3;k++){const value=source[i+k]!,blur=(source[i-4+k]!+source[i+4+k]!+source[i-1536+k]!+source[i+1536+k]!)/4;detail.data[i+k]=Math.max(0,Math.min(255,(value-128)*1.025+128+Math.max(-8,Math.min(8,(value-blur)*.22))));}}
 c.putImageData(detail,0,0);
 const high=document.createElement('canvas');high.width=high.height=512;const highContext=high.getContext('2d')!;highContext.imageSmoothingEnabled=true;highContext.imageSmoothingQuality='high';highContext.drawImage(canvas,0,0,512,512);
 const map=new CanvasTexture(high);map.colorSpace=SRGBColorSpace;map.anisotropy=16;
 const pixels=c.getImageData(0,0,384,384);for(let i=0;i<pixels.data.length;i+=4){const l=pixels.data[i]!*.2126+pixels.data[i+1]!*.7152+pixels.data[i+2]!*.0722;pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=l;}
 const height=document.createElement('canvas');height.width=height.height=384;height.getContext('2d')!.putImageData(pixels,0,0);const bump=new CanvasTexture(height);bump.anisotropy=16;
 return {map,bump};
}








