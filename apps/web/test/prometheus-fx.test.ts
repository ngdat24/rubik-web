import {afterEach,expect,it,vi} from 'vitest';
import {Color,Scene,Vector3} from 'three';
import {prometheusFx} from '../src/prometheus-fx.js';
afterEach(()=>vi.restoreAllMocks());

it('reuses particle GPU buffers and keeps the 64 solve particle positions, lifetimes and wave colors',()=>{
  const scene=new Scene(),fx=prometheusFx(scene,false);
  const particles=scene.children[0]!.children[0] as import('three').Points;
  const geometry=particles.geometry,position=geometry.getAttribute('position'),size=geometry.getAttribute('size'),life=geometry.getAttribute('life');
  fx.solve(0);fx.update(1500);expect(geometry.drawRange.count).toBe(64);
  const wave=scene.children[0]!.children[1] as import('three').Mesh<import('three').BufferGeometry,import('three').MeshBasicMaterial>;
  expect(wave.material.color.toArray()).toEqual(new Color(0xff2a55).lerp(new Color(0xfff3b0),(1500-650)/(2100-650)).toArray());
  const t=200/2300;
  for(let i=0;i<64;i++){
    const angle=i*2.39996+t*4.2,r=.5+((i*17)%43)/43*1.2;
    expect(position.getX(i)).toBeCloseTo(Math.cos(angle)*r,6);
    expect(position.getY(i)).toBeCloseTo(-1.4+(i%11)/11*2.8+t*1.4,6);
    expect(position.getZ(i)).toBeCloseTo(Math.sin(angle)*r,6);
    expect(size.getX(i)).toBe(2+i%4);expect(life.getX(i)).toBe(0);
  }
  fx.update(2000);expect(geometry.getAttribute('position')).toBe(position);expect(geometry.getAttribute('size')).toBe(size);expect(geometry.getAttribute('life')).toBe(life);
  fx.update(4000);expect(geometry.drawRange.count).toBe(0);fx.dispose();
});

it('preserves the full 256 turn sparks together with 64 solve particles',()=>{
  vi.spyOn(Math,'random').mockReturnValue(.5);
  const scene=new Scene(),fx=prometheusFx(scene,false);fx.solve(0);
  for(let i=0;i<30;i++)fx.turn('R',1500,new Vector3(6,5,7));
  fx.update(1500);
  const particles=scene.children[0]!.children[0] as import('three').Points;
  expect(particles.geometry.drawRange.count).toBe(320);expect(particles.geometry.getAttribute('position').count).toBe(320);
  fx.clear();fx.update(1501);expect(particles.geometry.drawRange.count).toBe(0);fx.dispose();
});
