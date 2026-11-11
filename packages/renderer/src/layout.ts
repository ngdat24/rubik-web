import { stickerGeometry, validateSize } from '@rubik/engine';
import type { Vector3 } from '@rubik/engine';

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
