import { BoxGeometry, Color, Group, InstancedMesh, Matrix4, MeshStandardMaterial, Quaternion, ShapeGeometry, Vector3 } from 'three';
import type { CubeLayout, layerSlots } from './layout.js';
import type { ColorTheme } from './colors.js';

/** Two draw calls for a large cube. Base slot transforms never change. */
export class InstancedCube {
  readonly bodies: InstancedMesh<BoxGeometry, MeshStandardMaterial>;
  readonly stickers: InstancedMesh<ShapeGeometry, MeshStandardMaterial>;
  private readonly material = new MeshStandardMaterial({color: 0xffffff, roughness: 0.65});
  private readonly bodyBases: Matrix4[] = [];
  private readonly stickerBases: Matrix4[] = [];
  private readonly rotation = new Matrix4();
  private readonly scratch = new Matrix4();
  private readonly colors = Array.from({length: 6}, () => new Color());
  private selection: ReturnType<typeof layerSlots> | undefined;
  private readonly displayed: Uint8Array;

  constructor(group: Group, layout: CubeLayout, bodyGeometry: BoxGeometry, stickerGeometry: ShapeGeometry,
    plastic: MeshStandardMaterial, theme: ColorTheme) {
    this.bodies = new InstancedMesh(bodyGeometry, plastic, layout.cubies.length);
    this.stickers = new InstancedMesh(stickerGeometry, this.material, layout.slots.length);
    this.bodies.frustumCulled = this.stickers.frustumCulled = false;
    const position = new Vector3(), normal = new Vector3(), forward = new Vector3(0,0,1);
    const quaternion = new Quaternion(), scale = new Vector3(1,1,1);
    for (const [index, cubie] of layout.cubies.entries()) {
      const matrix = new Matrix4().makeTranslation(...cubie.position);
      this.bodyBases.push(matrix); this.bodies.setMatrixAt(index, matrix);
    }
    for (const slot of layout.slots) {
      normal.set(...slot.normal);
      position.set(...slot.position).addScaledVector(normal, layout.cellSize * 0.002);
      quaternion.setFromUnitVectors(forward, normal);
      const matrix = new Matrix4().compose(position, quaternion, scale);
      this.stickerBases.push(matrix); this.stickers.setMatrixAt(slot.index, matrix);
    }
    this.displayed = Uint8Array.from(layout.slots, slot => slot.face);
    this.paint(this.displayed, theme);
    group.add(this.bodies, this.stickers);
  }

  paint(state: Uint8Array, theme: ColorTheme): void {
    this.displayed.set(state);
    for (let i = 0; i < 6; i++) this.colors[i]!.setHex(theme[i]!);
    for (let i = 0; i < state.length; i++) this.stickers.setColorAt(i, this.colors[state[i]!]!);
    this.stickers.instanceColor!.needsUpdate = true;
  }

  setTheme(theme: ColorTheme): void { this.paint(this.displayed, theme); }
  begin(selection: ReturnType<typeof layerSlots>): void { this.selection = selection; }

  rotate(quaternion: Quaternion): void {
    if (!this.selection) return;
    this.rotation.makeRotationFromQuaternion(quaternion);
    for (const index of this.selection.cubieIndices) {
      this.scratch.multiplyMatrices(this.rotation, this.bodyBases[index]!);
      this.bodies.setMatrixAt(index, this.scratch);
    }
    for (const index of this.selection.stickerIndices) {
      this.scratch.multiplyMatrices(this.rotation, this.stickerBases[index]!);
      this.stickers.setMatrixAt(index, this.scratch);
    }
    this.bodies.instanceMatrix.needsUpdate = this.stickers.instanceMatrix.needsUpdate = true;
  }

  end(): void {
    if (!this.selection) return;
    for (const index of this.selection.cubieIndices) this.bodies.setMatrixAt(index, this.bodyBases[index]!);
    for (const index of this.selection.stickerIndices) this.stickers.setMatrixAt(index, this.stickerBases[index]!);
    this.bodies.instanceMatrix.needsUpdate = this.stickers.instanceMatrix.needsUpdate = true;
    this.selection = undefined;
  }

  dispose(): void { this.end(); this.bodies.dispose(); this.stickers.dispose(); this.material.dispose(); }
}
