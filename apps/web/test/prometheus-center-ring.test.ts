import {describe,expect,it} from 'vitest';
import {Mesh,MeshPhysicalMaterial} from 'three';
import type {BufferGeometry} from 'three';
import {centerRing} from '../src/prometheus-center-ring.js';

describe('center ornament geometry',()=>{
  it('keeps both circular boundaries concentric and constant-width around the entire band',()=>{
    const material=new MeshPhysicalMaterial(),geometries:BufferGeometry[]=[];
    const ring=centerRing(material,material,geometries);
    const band=(ring.children[0] as Mesh).geometry.getAttribute('position');
    for(let i=0;i<band.count;i++){
      const radius=Math.hypot(band.getX(i),band.getY(i));
      expect(Math.min(Math.abs(radius-.354),Math.abs(radius-.390))).toBeLessThan(1e-6);
    }
    expect(ring.position.x).toBe(0);expect(ring.position.y).toBe(0);
    geometries.forEach(g=>g.dispose());material.dispose();
  });
  it('centers the star frame on both axes with equal horizontal and vertical extent',()=>{
    const material=new MeshPhysicalMaterial(),geometries:BufferGeometry[]=[];
    const ring=centerRing(material,material,geometries);
    const star=ring.children.find(child=>child.userData.kind==='center-star-frame') as Mesh;
    star.geometry.computeBoundingBox();const box=star.geometry.boundingBox!;
    expect(star.position.x).toBe(0);expect(star.position.y).toBe(0);
    expect(box.min.x+box.max.x).toBeCloseTo(0,6);expect(box.min.y+box.max.y).toBeCloseTo(0,6);
    expect(box.max.x).toBeCloseTo(box.max.y,6);
    geometries.forEach(g=>g.dispose());material.dispose();
  });
});
