import {ExtrudeGeometry,Path,Shape,Vector2} from 'three';

export function sacredFlame(radius=.285):Shape{
  const s=new Shape(),r=radius;
  s.moveTo(0,r);
  s.bezierCurveTo(r*.13,r*.26,r*.26,r*.13,r,0);
  s.bezierCurveTo(r*.26,-r*.13,r*.13,-r*.26,0,-r);
  s.bezierCurveTo(-r*.13,-r*.26,-r*.26,-r*.13,-r,0);
  s.bezierCurveTo(-r*.26,r*.13,-r*.13,r*.26,0,r);s.closePath();return s;
}

/** Actual small bronze reliefs: no enlarged scan or painted specular highlights. */
export function bronzeRelief(tile:number,outline:Shape):ExtrudeGeometry {
  const shapes:Shape[]=[];
  const rim=new Shape(outline.getPoints(16).map(p=>p.multiplyScalar(.965)));
  const hole=new Path(outline.getPoints(16).map(p=>p.multiplyScalar(.946)).reverse());
  rim.holes.push(hole);shapes.push(rim);
  const ribbon=(points:number[][],width=.009)=>{
    // Thin rectilinear meander strips, raised above the quartz.
    for(let i=1;i<points.length;i++){
      const a=points[i-1]!,b=points[i]!,dx=b[0]!-a[0]!,dy=b[1]!-a[1]!,length=Math.hypot(dx,dy);
      if(!length)continue;
      const x=-dy/length*width/2,y=dx/length*width/2,s=new Shape();
      s.moveTo(a[0]!+x,a[1]!+y);s.lineTo(b[0]!+x,b[1]!+y);s.lineTo(b[0]!-x,b[1]!-y);s.lineTo(a[0]!-x,a[1]!-y);s.closePath();shapes.push(s);
    }
  };
  if(tile===4){
    const ring=(outer:number,inner:number)=>{
      const shape=new Shape();shape.absarc(0,0,outer,0,Math.PI*2,false);
      const hole=new Path();hole.absarc(0,0,inner,0,Math.PI*2,true);shape.holes.push(hole);shapes.push(shape);
    };
    ring(.408,.377);ring(.337,.326);
    for(let i=0;i<36;i++){
      const a=i*Math.PI*2/36;
      ribbon([[Math.cos(a)*.385,Math.sin(a)*.385],[Math.cos(a)*.400,Math.sin(a)*.400]],.004);
    }
    const outline=sacredFlame(.31),hole=new Path(sacredFlame(.277).getPoints(24).reverse());outline.holes.push(hole);shapes.push(outline);
  }else if([1,3,5,7].includes(tile)){
    const angle=tile===1?0:tile===3?Math.PI/2:tile===5?-Math.PI/2:Math.PI;
    const transform=(x:number,y:number)=>[x*Math.cos(angle)-y*Math.sin(angle),x*Math.sin(angle)+y*Math.cos(angle)];
    for(let i=0;i<5;i++){
      const x=-.365+i*.146;
      ribbon([[x,.40],[x+.128,.40],[x+.128,.305],[x+.032,.305],[x+.032,.371],[x+.096,.371],[x+.096,.337]].map(([u,v])=>transform(u!,v!)),.009);
    }
    ribbon([[-.385,.283],[.385,.283]].map(([u,v])=>transform(u!,v!)),.004);
    ribbon([[-.385,.425],[.385,.425]].map(([u,v])=>transform(u!,v!)),.004);
  }else{
    const angle=tile===0?0:tile===2?-Math.PI/2:tile===6?Math.PI/2:Math.PI;
    const point=(x:number,y:number)=>new Vector2(x,y).rotateAround(new Vector2(),angle);
    const transform=(s:Shape)=>{
      const transformed=new Shape(s.getPoints(10).map(p=>point(p.x,p.y)));shapes.push(transformed);
    };
    const feather=(sx:number,sy:number,tx:number,ty:number,width:number,bend:number)=>{
      const dx=tx-sx,dy=ty-sy,length=Math.hypot(dx,dy),px=-dy/length,py=dx/length;
      const mx=(sx+tx)/2+px*bend,my=(sy+ty)/2+py*bend,s=new Shape();
      s.moveTo(sx,sy);s.quadraticCurveTo(mx+px*width,my+py*width,tx,ty);
      s.quadraticCurveTo(mx-px*width*.45,my-py*width*.45,sx,sy);transform(s);
    };
    // Swept phoenix wings, layered individual feathers and a long curling tail.
    for(let i=0;i<7;i++){
      feather(-.015,-.015,.07+i*.045,.36-i*.045,.024-i*.001,-.045);
      feather(-.04,.005,-.35+i*.038,.19+i*.027,.020,.035);
    }
    for(let i=0;i<5;i++)feather(-.015,-.06,-.22+i*.068,-.37+i*.018,.016,.07);
    const body=new Shape();body.moveTo(-.03,-.16);body.bezierCurveTo(.11,-.02,.02,.08,-.11,.15);
    body.bezierCurveTo(-.18,.20,-.19,.24,-.15,.27);body.bezierCurveTo(-.10,.31,-.06,.26,-.09,.23);
    body.lineTo(-.03,.245);body.lineTo(-.09,.28);body.bezierCurveTo(-.2,.39,-.30,.22,-.18,.13);
    body.bezierCurveTo(-.08,.04,-.07,-.08,-.03,-.16);transform(body);
    feather(-.17,.29,-.26,.38,.009,-.018);
    feather(-.14,.30,-.15,.405,.008,.012);
  }
  return new ExtrudeGeometry(shapes,{depth:.010,bevelEnabled:true,bevelSize:.003,bevelThickness:.003,bevelSegments:3,steps:1,curveSegments:10});
}
