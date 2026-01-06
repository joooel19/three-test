import * as THREE from 'three';
import { GrassChunk } from './grass-chunk';
import { SkyController } from './sky';

export interface ChunkEntry {
  mesh: THREE.Mesh;
  heightData: Float32Array;
  width: number;
  depth: number;
  offsetX: number;
  offsetZ: number;
  grass: GrassChunk;
}

export class TerrainChunk {
  public mesh: THREE.Mesh;
  public heightData: Float32Array;
  public width: number;
  public depth: number;
  public offsetX: number;
  public offsetZ: number;
  public grass: GrassChunk;

  constructor(entry: ChunkEntry) {
    this.mesh = entry.mesh;
    this.heightData = entry.heightData;
    this.width = entry.width;
    this.depth = entry.depth;
    this.offsetX = entry.offsetX;
    this.offsetZ = entry.offsetZ;
    this.grass = entry.grass;
  }

  addTo(parent: THREE.Group) {
    parent.add(this.grass.mesh);
    parent.add(this.mesh);
  }

  sampleCellHeight(ix: number, iz: number) {
    const lx = ix - this.offsetX;
    const lz = iz - this.offsetZ;
    if (lx < 0 || lz < 0 || lx >= this.width || lz >= this.depth) return 0;
    const index = lx + lz * this.width;
    return this.heightData[index] || 0;
  }

  update(camera: THREE.Camera, delta: number, skyController: SkyController) {
    // Update grass and other per-chunk items. Water is managed globally by SkyController.
    // Use camera world position for LOD checks — camera.position may be local.
    const camPos = new THREE.Vector3();
    camera.getWorldPosition(camPos);
    this.grass.update(delta, camPos, skyController);
  }

  dispose(parent: THREE.Group) {
    parent.remove(this.mesh);
    this.grass.dispose(parent);

    const geom = this.mesh.geometry;
    const mat = this.mesh.material;
    if (Array.isArray(mat)) {
      for (let mi = 0; mi < mat.length; mi += 1) {
        const matItem = mat[mi];
        const maybeMap = (
          matItem as unknown as { map?: { dispose: () => void } }
        ).map;
        if (maybeMap && typeof maybeMap.dispose === 'function')
          maybeMap.dispose();
        matItem.dispose();
      }
    } else {
      const maybeMap = (mat as unknown as { map?: { dispose: () => void } })
        .map;
      if (maybeMap && typeof maybeMap.dispose === 'function')
        maybeMap.dispose();
      mat.dispose();
    }
    geom.dispose();
  }
}
