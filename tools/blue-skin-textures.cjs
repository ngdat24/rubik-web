// Deterministic study textures: albedo stays neutral so face colours remain readable.
const fs=require('fs'),zlib=require('zlib');
const skins=JSON.parse(fs.readFileSync('apps/web/public/assets/blue-skin-demo.json','utf8').replace(/^\uFEFF/,''));
const N=512,clamp=x=>Math.max(0,Math.min(255,Math.round(x)));
function crc(b){let c=-1;for(const v of b){c^=v;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^-1)>>>0;}
function chunk(type,data){const t=Buffer.from(type),b=Buffer.concat([t,data]),h=Buffer.alloc(4),c=Buffer.alloc(4);h.writeUInt32BE(data.length);c.writeUInt32BE(crc(b));return Buffer.concat([h,b,c]);}
function png(path,pixels,width=N,height=N){const h=Buffer.alloc(13);h.writeUInt32BE(width,0);h.writeUInt32BE(height,4);h[8]=8;h[9]=2;const rows=[];for(let y=0;y<height;y++)rows.push(Buffer.from([0]),pixels.subarray(y*width*3,(y+1)*width*3));fs.writeFileSync(path,Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',h),chunk('IDAT',zlib.deflateSync(Buffer.concat(rows))),chunk('IEND',Buffer.alloc(0))]));}
const hash=(x,y)=>{const n=Math.sin(x*127.1+y*311.7)*43758.5453;return n-Math.floor(n);};
function height(kind,x,y,seed=0){
 if(kind===0){const u=x,v=y;x=(u+v)*Math.SQRT1_2+1024;y=(v-u)*Math.SQRT1_2+1024;const a=Math.floor(x/64),b=Math.floor(y/64),vertical=(a+b)%2===0,p=(vertical?x:y)%64/64;return .24+.50*Math.pow(Math.sin(Math.PI*p),.6)+.055*Math.sin((vertical?x:y)*Math.PI*.65)+.035*Math.cos((vertical?y:x)*.08);}
 if(kind===1){let d1=1e9,d2=1e9;const scale=88,gx=Math.floor(x/scale),gy=Math.floor(y/scale);for(let a=gx-1;a<=gx+1;a++)for(let b=gy-1;b<=gy+1;b++){const d=Math.hypot(x+Math.sin(y*.06)*1.5-(a+hash(a,b)*.8)*scale,y+Math.sin(x*.08)-(b+hash(b,a+2)*.8)*scale);if(d<d1){d2=d1;d1=d;}else if(d<d2)d2=d;}const crack=Math.exp(-(d2-d1)*.32);return .77-.68*crack+.018*Math.sin(x*.024+y*.036);}
 if(kind===2)return .48+.26*hash(x,y)+.09*Math.sin(x*.7)*Math.sin(y*.4)+.07*Math.sin(y*.12+Math.sin(x*.035));
 if(kind===3){let nearest=1e9;for(let row=Math.floor(y/70)-1;row<=Math.floor(y/70)+1;row++)for(let col=Math.floor(x/81)-1;col<=Math.floor(x/81)+1;col++){const px=x-col*81-(row%2)*40.5,py=y-row*70;nearest=Math.min(nearest,Math.max(Math.abs(px)*.866+Math.abs(py)*.5,Math.abs(py)));}return .76-.5*Math.exp(-Math.pow((nearest-37)/2,2));}
 if(kind===4){const cx=90+hash(seed,13)*330,cy=80+hash(seed,19)*340,r=Math.hypot(x-cx,y-cy),frequency=.075+hash(seed,23)*.05;return .56+.22*Math.sin(r*frequency+Math.sin(Math.atan2(y-cy,x-cx)*3+seed)*.36)+.045*Math.sin(x*.021+y*.028+seed);}
 if(kind===5){const diagonal=Math.abs(x-y)/N,fan=Math.min(Math.abs(x-256),Math.abs(y-256))/N;return .55+.105*(x>y?1:-1)+.045*Math.sin((x+y)*.015)+.08*Math.exp(-diagonal*140)+.025*Math.exp(-fan*90)+.008*hash(x,y);}
 const cx=170+hash(seed,33)*172,cy=160+hash(seed,37)*190,r=Math.hypot((x-cx)*( .9+hash(seed,39)*.2),y-cy),ring=Math.min(...[65,130,203].map((v,i)=>Math.abs(r-v-18*hash(seed,i))));return .68-.4*Math.exp(-ring*ring/4)+.18*(hash(Math.floor(x/16)+seed,Math.floor(y/16))>.985?1:0);
}
skins.forEach((skin,kind)=>{const dir='apps/web/public/assets/skins/'+skin.skin_id;fs.mkdirSync(dir,{recursive:true});const albedo=Buffer.alloc(N*N*3),normal=Buffer.alloc(N*N*3),roughness=Buffer.alloc(N*N*3),ao=Buffer.alloc(N*N*3);for(let y=0;y<N;y++)for(let x=0;x<N;x++){const i=(y*N+x)*3,h=height(kind,x,y),a=clamp((kind===0?148:kind===1?110:190)+h*(kind===0?125:kind===1?160:65));albedo.fill(a,i,i+3);const dx=(height(kind,x+1,y)-height(kind,x-1,y))*2,dy=(height(kind,x,y+1)-height(kind,x,y-1))*2,l=Math.hypot(dx,dy,1);normal[i]=clamp(128-dx/l*127);normal[i+1]=clamp(128+dy/l*127);normal[i+2]=clamp(128+127/l);roughness.fill(clamp(185+h*55),i,i+3);ao.fill(clamp(215+h*40),i,i+3);}for(const face of ['u','r','f','d','l','b'])png(dir+'/albedo_'+face+'.png',albedo);png(dir+'/normal.png',normal);png(dir+'/roughness.png',roughness);png(dir+'/ao.png',ao);});
// Independent, deterministic artwork for every physical sticker; never randomise on render.
for(const kind of [4,6])for(const [face,letter]of ['u','r','f','d','l','b'].entries()){
 const width=768,unit=width/3,albedo=Buffer.alloc(width*width*3),normal=Buffer.alloc(width*width*3);
 for(let y=0;y<width;y++)for(let x=0;x<width;x++){
  const tile=Math.floor(y/unit)*3+Math.floor(x/unit),seed=face*9+tile,px=x%unit*2,py=y%unit*2;
  const i=(y*width+x)*3,h=height(kind,px,py,seed);albedo.fill(clamp(175+h*82),i,i+3);
  const dx=(height(kind,px+2,py,seed)-height(kind,px-2,py,seed))*1.5,dy=(height(kind,px,py+2,seed)-height(kind,px,py-2,seed))*1.5,l=Math.hypot(dx,dy,1);
  normal[i]=clamp(128-dx/l*127);normal[i+1]=clamp(128+dy/l*127);normal[i+2]=clamp(128+127/l);
 }
 const dir='apps/web/public/assets/skins/'+skins[kind].skin_id;
 png(dir+'/atlas_'+letter+'.png',albedo,width,width);png(dir+'/normal_atlas_'+letter+'.png',normal,width,width);
}
