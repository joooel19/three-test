import * as THREE from 'three';
import { CloudVolume } from './cloud';
import { GrassChunk } from './grass-chunk';
import { SkyController } from './sky';
import { Water } from 'three/examples/jsm/objects/Water';

export interface ChunkEntry {
  mesh: THREE.Mesh;
  heightData: Float32Array;
  width: number;
  depth: number;
  offsetX: number;
  offsetZ: number;
  water: Water;
  clouds: CloudVolume[];
  grass: GrassChunk;
}

export class TerrainChunk {
  public mesh: THREE.Mesh;
  public heightData: Float32Array;
  public width: number;
  public depth: number;
  public offsetX: number;
  public offsetZ: number;
  public water: Water;
  public clouds: CloudVolume[];
  public grass: GrassChunk;

  constructor(entry: ChunkEntry) {
    this.mesh = entry.mesh;
    this.heightData = entry.heightData;
    this.width = entry.width;
    this.depth = entry.depth;
    this.offsetX = entry.offsetX;
    this.offsetZ = entry.offsetZ;
    this.water = entry.water;
    this.clouds = entry.clouds;
    this.grass = entry.grass;
  }

  addTo(parent: THREE.Group) {
    parent.add(this.water);
    parent.add(...this.clouds);
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
    const uniforms = this.water.material.uniforms as {
      time: THREE.IUniform<number>;
      sunDirection: THREE.IUniform<THREE.Vector3>;
    };
    uniforms.time.value += delta;
    uniforms.sunDirection.value.copy(skyController.sun).normalize();
    for (const cloud of this.clouds) cloud.update(camera);
    this.grass.update(delta, camera.position);
  }

  dispose(parent: THREE.Group) {
    parent.remove(this.mesh);
    parent.remove(this.water);
    this.water.geometry.dispose();
    this.water.material.dispose();
    this.grass.dispose(parent);
    for (const cloud of this.clouds) {
      parent.remove(cloud);
      cloud.geometry.dispose();

      const mat = cloud.material as THREE.RawShaderMaterial | undefined;
      if (!mat) continue;

      const mapValue = (
        mat.uniforms as { map?: { value?: { dispose?: () => void } } }
      ).map?.value;
      if (mapValue && typeof mapValue.dispose === 'function')
        mapValue.dispose();

      mat.dispose();
    }

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
