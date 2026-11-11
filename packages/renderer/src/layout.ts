import { parseMove, stickerGeometry, validateSize } from '@rubik/engine';
import type { ParsedMove, Vector3 } from '@rubik/engine';

export interface LayoutOptions {
  edgeLength?: number;
  /** Fraction of a cell between black cubies. */
  gapRatio?: number;
  /** Sticker border on each side, as a fraction of one cell. */
  stickerInsetRatio?: number;
}
export interface StickerSlot { index: number; face: number; position: Vector3; normal: Vector3 }
export interface CubieSlot { position: Vector3; coordinates: Vector3 }
export interface CubeLayout {
  size: number; edgeLength: number; cellSize: number; cubieSize: number; stickerSize: number;
  slots: StickerSlot[]; cubies: CubieSlot[];
}

/** Pure layout derived from E2. Slot positions describe the ideal cube surface. */
export function buildLayout(size: number, options: LayoutOptions = {}): CubeLayout {
  validateSize(size);
  const { edgeLength = 3, gapRatio = 0.04, stickerInsetRatio = 0.08 } = options;
  if (!Number.isFinite(edgeLength) || edgeLength <= 0
    || !Number.isFinite(gapRatio) || gapRatio < 0 || gapRatio >= 1
    || !Number.isFinite(stickerInsetRatio) || stickerInsetRatio < 0
    || gapRatio + 2 * stickerInsetRatio >= 1) throw new RangeError('Invalid cube layout dimensions');
  const cellSize = edgeLength / size;
  const slots: StickerSlot[] = [];
  const cubies = new Map<string, CubieSlot>();
  for (let index = 0; index < 6 * size * size; index++) {
    const { cubie, normal } = stickerGeometry(index, size);
    const center = cubie.map(value => value * cellSize / 2) as [number, number, number];
    const position = center.map((value, axis) => value + normal[axis]! * cellSize / 2) as [number, number, number];
    slots.push({ index, face: Math.floor(index / (size * size)), position, normal });
    const key = cubie.join(',');
    if (!cubies.has(key)) cubies.set(key, { position: center, coordinates: cubie });
  }
  return { size, edgeLength, cellSize, cubieSize: cellSize * (1 - gapRatio),
    stickerSize: cellSize * (1 - gapRatio - 2 * stickerInsetRatio), slots, cubies: [...cubies.values()] };
}

/** Select by cubie coordinate, including every sticker on each selected cubie. */
export function layerSlots(move: ParsedMove, size: number): { stickerIndices: number[]; cubieIndices: number[] } {
  const parsed = parseMove(move.canonical, size);
  const layout = buildLayout(size);
  const axis = {x: 0, y: 1, z: 2}[parsed.axis];
  const selected = (coordinates: Vector3) => {
    const layer = (size + 1 - coordinates[axis]!) / 2;
    return layer >= parsed.layerStart && layer <= parsed.layerEnd;
  };
  return {
    stickerIndices: layout.slots.filter(slot => selected(stickerGeometry(slot.index, size).cubie)).map(slot => slot.index),
    cubieIndices: layout.cubies.flatMap((cubie, index) => selected(cubie.coordinates) ? [index] : []),
  };
}

export function rotationFor(move: ParsedMove): { axis: Vector3; angle: number } {
  const axis: Vector3 = move.axis === 'x' ? [1, 0, 0] : move.axis === 'y' ? [0, 1, 0] : [0, 0, 1];
  return { axis, angle: move.quarterTurns * Math.PI / 2 };
}

/** Engine-owned slot identity, shared by mesh and instance raycasts. */
export function pickedSlot(size: number, index: number): StickerSlot | null {
  if (!Number.isInteger(index) || index < 0 || index >= 6*size*size) return null;
  return buildLayout(size).slots[index]!;
}
/** Drag in a face plane: normal cross displacement determines the rotation axis. */
export function dragTurn(size: number, index: number, delta: readonly number[]) {
  const slot = pickedSlot(size,index);
  if (!slot || delta.length!==3 || delta.some(v=>!Number.isFinite(v))) return null;
  const n=slot.normal, d=delta;
  const cross=[n[1]*d[2]!-n[2]*d[1]!,n[2]*d[0]!-n[0]*d[2]!,n[0]*d[1]!-n[1]*d[0]!];
  const axis=cross.reduce((best,v,i)=>Math.abs(v)>Math.abs(cross[best]!)?i:best,0);
  if (Math.abs(cross[axis]!)<1e-8) return null;
  const layer=(size+1-stickerGeometry(index,size).cubie[axis]!)/2;
  const opposite=size===2 && layer===2;
  const face=(opposite?['L','D','B']:['R','U','F'])[axis]!;
  const move=`${layer===1 || opposite?'':layer}${face}${(cross[axis]!>0)!==opposite?"'":''}`;
  return {axis,layer,move,sign:Math.sign(cross[axis]!)};
}
