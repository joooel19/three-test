import * as THREE from 'three';
import { ChunkEntry, TerrainChunk } from './terrain-chunk';
import { Grass } from './grass/grass';
import { NoiseGenerator } from './noise';
import { SkyController } from '../sky/sky';
import { Tree } from '@dgreenheck/ez-tree';
import {
  makeSampleFromHeightData,
  createGrassForChunk,
  generateTreesForChunk,
  generateFlowersForChunk,
} from './terrain-chunk-utilities';

import {
  buildGeometry,
  colorGeometry,
  createNoiseMaterial,
  computeNoiseRanges,
  smoothStep,
  getChunkNormalArray,
  mergeBorderNormals,
  makeKey,
} from './terrain-utilities';

export class Terrain extends THREE.Group {
  private chunkSize = 8;
  private heightScale = 36;
  private lacunarity = 2;
  private seed = 42;
  private elevationExponent = 1.6;
  private hillNoiseScale = 0.008;
  private detailNoiseScale = 0.06;
  private hillOctaves = 5;
  private detailOctaves = 5;
  private hillPersistence = 0.65;
  private detailPersistence = 0.5;
  private hillAmplitude = 2;
  private detailAmplitude = 0.9;
  private flatThreshold = 0.35;
  private flatBlend = 0.12;
  private cellSize = 4096 / (200 - 1);
  private lastChunkX?: number;
  private lastChunkZ?: number;
  private chunks: Map<string, TerrainChunk> = new Map();
  private noiseRanges: {
    hillMin: number;
    hillMax: number;
    detailMin: number;
    detailMax: number;
  };
  private noiseGenerator: NoiseGenerator;
  private chunkRadius = 3;
  private waterLevel = 16;
  private skyController: SkyController;
  private treePoolSize = 8;
  private baseTrees: THREE.LOD[] = [];
  private treeNoiseScale = 0.025;
  private treeNoiseOctaves = 3;
  private treeNoisePersistence = 0.55;
  private maxTreesPerChunk = 16;
  private maxDaisiesPerChunk = 48;
  private flowerNoiseScale = 0.12;

  constructor(skyController: SkyController) {
    super();
    this.skyController = skyController;
    this.noiseGenerator = new NoiseGenerator();
    // Pre-generate a small pool of tree prototypes to clone per-chunk
    for (let index = 0; index < this.treePoolSize; index += 1) {
      const treePrototype = new Tree();
      treePrototype.options.seed = Math.random() * 12_345;
      treePrototype.generate();
      const treeLod = new THREE.LOD();
      treeLod.addLevel(treePrototype, 0);
      treeLod.addLevel(new THREE.Object3D(), 320);
      this.baseTrees.push(treeLod);
    }
    const sampleChunks = 4;
    this.noiseRanges = computeNoiseRanges(
      this.noiseGenerator,
      this.chunkSize * sampleChunks,
      this.chunkSize * sampleChunks,
      {
        lacunarity: this.lacunarity,
        hillOctaves: this.hillOctaves,
        detailOctaves: this.detailOctaves,
        seed: this.seed,
        hillPersistence: this.hillPersistence,
        detailPersistence: this.detailPersistence,
        hillNoiseScale: this.hillNoiseScale,
        detailNoiseScale: this.detailNoiseScale,
      },
    );

    // Load an initial area around origin (player at 0,0)
    this.updateChunks(0, 0);
    // With the new mapping, cell (0,0) sits at world position (0,0).
    const gx0 = 0 / this.cellSize;
    const gz0 = 0 / this.cellSize;
    this.lastChunkX = Math.floor(gx0 / this.chunkSize);
    this.lastChunkZ = Math.floor(gz0 / this.chunkSize);
  }

  private smoothChunkBorders() {
    const cw = this.chunkSize + 1;
    const cd = this.chunkSize + 1;

    for (const key of this.chunks.keys()) {
      const [cx, cz] = key.split(',').map(Number);
      const chunk = this.chunks.get(key);
      if (!chunk) continue;
      const source = getChunkNormalArray(chunk);
      if (!source) continue;

      // Neighbor +X
      const right = this.chunks.get(makeKey(cx + 1, cz));
      const rightNormals = right ? getChunkNormalArray(right) : null;
      if (rightNormals) {
        mergeBorderNormals({
          arrayA: source.array,
          attributeA: source.attr,
          arrayB: rightNormals.array,
          attributeB: rightNormals.attr,
          cw,
          cd,
          orientation: 'x',
        });
      }

      // Neighbor +Z
      const far = this.chunks.get(makeKey(cx, cz + 1));
      const farNormals = far ? getChunkNormalArray(far) : null;
      if (farNormals) {
        mergeBorderNormals({
          arrayA: source.array,
          attributeA: source.attr,
          arrayB: farNormals.array,
          attributeB: farNormals.attr,
          cw,
          cd,
          orientation: 'z',
        });
      }
    }
  }

  private generateHeight(
    width: number,
    depth: number,
    offsetX = 0,
    offsetZ = 0,
  ) {
    const size = width * depth;
    const out = new Float32Array(size);

    // Use global noiseRanges (precomputed) to avoid a local pass
    const nr = this.noiseRanges;

    const hillRange = nr.hillMax - nr.hillMin || 1;
    const detailRange = nr.detailMax - nr.detailMin || 1;
    const edge0 = this.flatThreshold - this.flatBlend;
    const edge1 = this.flatThreshold + this.flatBlend;

    // Use nested loops (faster than modulo/floor per-iteration) and avoid
    // Sampling detail noise when the hill mask is zero to reduce noise calls.
    let sampleIndex = 0;
    for (let dz = 0; dz < depth; dz += 1) {
      const y = offsetZ + dz;
      for (let dx = 0; dx < width; dx += 1) {
        const x = offsetX + dx;

        const hRaw = this.noiseGenerator.sampleOctaves(x, y, {
          lacunarity: this.lacunarity,
          octaves: this.hillOctaves,
          offsetZ: this.seed,
          persistence: this.hillPersistence,
          scale: this.hillNoiseScale,
        });

        const hillNorm = (hRaw - nr.hillMin) / hillRange;

        // Only sample detail noise when hill mask > 0 to save work.
        const mask = smoothStep(hillNorm, edge0, edge1);
        let detailNorm = 0;
        if (mask > 0) {
          const dRaw = this.noiseGenerator.sampleOctaves(x, y, {
            lacunarity: this.lacunarity,
            octaves: this.detailOctaves,
            offsetZ: this.seed + 512,
            persistence: this.detailPersistence,
            scale: this.detailNoiseScale,
          });
          detailNorm = (dRaw - nr.detailMin) / detailRange;
        }

        const combined =
          hillNorm * this.hillAmplitude +
          detailNorm * this.detailAmplitude * mask;
        const clamped = Math.max(0, combined);
        out[sampleIndex] = clamped ** this.elevationExponent;
        sampleIndex += 1;
      }
    }

    return out;
  }

  private sampleCellHeight(ix: number, iz: number) {
    // Compute the chunk coordinates directly and perform a keyed lookup
    const cx = Math.floor(ix / this.chunkSize);
    const cz = Math.floor(iz / this.chunkSize);
    const key = makeKey(cx, cz);
    const chunk = this.chunks.get(key);
    if (!chunk) return 0;
    return chunk.sampleCellHeight(ix, iz);
  }

  private createChunk(cx: number, cz: number) {
    const offsetX = cx * this.chunkSize;
    const offsetZ = cz * this.chunkSize;
    const cw = this.chunkSize + 1;
    const cd = this.chunkSize + 1;

    const heightData = this.generateHeight(cw, cd, offsetX, offsetZ);
    for (let hi = 0; hi < heightData.length; hi += 1) {
      const vertex = heightData[hi];
      if (!Number.isFinite(vertex) || vertex < 0) heightData[hi] = 0;
    }

    const { geometry, centerX, centerZ, chunkPlaneWidth, chunkPlaneDepth } =
      buildGeometry({
        cw,
        cd,
        offsetX,
        offsetZ,
        heightData,
        cellSize: this.cellSize,
        heightScale: this.heightScale,
      });

    colorGeometry({
      geometry,
      centerX,
      centerZ,
      cellSize: this.cellSize,
      waterLevel: this.waterLevel,
      seed: this.seed,
      noiseGenerator: this.noiseGenerator,
    });

    const material = createNoiseMaterial();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(centerX, 0, centerZ);

    const sampleFromHeightData = makeSampleFromHeightData({
      heightData,
      cw,
      cd,
      offsetX,
      offsetZ,
      cellSize: this.cellSize,
      heightScale: this.heightScale,
    });

    const grass = createGrassForChunk({
      centerX,
      centerZ,
      sample: sampleFromHeightData,
      width: chunkPlaneWidth,
      waterLevel: this.waterLevel,
    });

    const objects = this.generateObjectsForChunk(
      centerX,
      centerZ,
      chunkPlaneWidth,
      chunkPlaneDepth,
      sampleFromHeightData,
    );

    const key = makeKey(cx, cz);
    const entry: ChunkEntry = {
      depth: cd,
      grass,
      heightData,
      mesh,
      objects,
      offsetX,
      offsetZ,
      width: cw,
    };
    const chunk = new TerrainChunk(entry);
    chunk.addTo(this);
    this.chunks.set(key, chunk);
  }

  private generateObjectsForChunk(
    centerX: number,
    centerZ: number,
    chunkPlaneWidth: number,
    chunkPlaneDepth: number,
    sampleFromHeightData: (x: number, z: number) => number,
  ) {
    const trees = generateTreesForChunk({
      baseTrees: this.baseTrees,
      centerX,
      centerZ,
      chunkPlaneWidth,
      chunkPlaneDepth,
      sampleFromHeightData,
      cellSize: this.cellSize,
      noiseGenerator: this.noiseGenerator,
      lacunarity: this.lacunarity,
      treeNoiseOctaves: this.treeNoiseOctaves,
      seed: this.seed,
      treeNoisePersistence: this.treeNoisePersistence,
      treeNoiseScale: this.treeNoiseScale,
      maxTreesPerChunk: this.maxTreesPerChunk,
      waterLevel: this.waterLevel,
    });
    const flowers = generateFlowersForChunk({
      centerX,
      centerZ,
      chunkPlaneWidth,
      chunkPlaneDepth,
      sampleFromHeightData,
      cellSize: this.cellSize,
      waterLevel: this.waterLevel,
      maxDaisiesPerChunk: this.maxDaisiesPerChunk,
      flowerNoiseScale: this.flowerNoiseScale,
      noiseGenerator: this.noiseGenerator,
      seed: this.seed,
    });
    return [...trees, ...flowers];
  }

  private disposeChunk(cx: number, cz: number) {
    const key = makeKey(cx, cz);
    const chunk = this.chunks.get(key);
    if (!chunk) return;
    chunk.dispose(this);
    this.chunks.delete(key);
  }

  public updateChunks(playerX: number, playerZ: number) {
    // Map world coordinates to grid cell coordinates (cell size units)
    const gx = playerX / this.cellSize;
    const gz = playerZ / this.cellSize;
    const centerCX = Math.floor(gx / this.chunkSize);
    const centerCZ = Math.floor(gz / this.chunkSize);

    const wanted = new Set<string>();
    const side = this.chunkRadius * 2 + 1;
    const total = side * side;
    for (let index = 0; index < total; index += 1) {
      const dx = (index % side) - this.chunkRadius;
      const dz = Math.floor(index / side) - this.chunkRadius;
      const cx = centerCX + dx;
      const cz = centerCZ + dz;
      const key = makeKey(cx, cz);
      wanted.add(key);
      if (!this.chunks.has(key)) this.createChunk(cx, cz);
    }

    // Dispose chunks not wanted
    for (const key of this.chunks.keys())
      if (!wanted.has(key)) {
        const [sx, sz] = key.split(',').map(Number);
        this.disposeChunk(sx, sz);
      }

    // After creating/disposing chunks, smooth normals along chunk borders
    this.smoothChunkBorders();
  }

  public updatePlayerPosition(position: THREE.Vector3) {
    const gx = position.x / this.cellSize;
    const gz = position.z / this.cellSize;
    const cx = Math.floor(gx / this.chunkSize);
    const cz = Math.floor(gz / this.chunkSize);
    if (this.lastChunkX !== cx || this.lastChunkZ !== cz) {
      this.lastChunkX = cx;
      this.lastChunkZ = cz;
      this.updateChunks(position.x, position.z);
    }
  }

  public getHeightAt(x: number, z: number) {
    // Map world coordinates to grid cell coordinates
    const fx = x / this.cellSize;
    const fz = z / this.cellSize;
    const ix = Math.floor(fx);
    const iz = Math.floor(fz);
    const tx = fx - ix;
    const tz = fz - iz;
    // Do not clamp indices; streaming supports chunks beyond original world bounds.
    const ix1 = ix;
    const iz1 = iz;
    const ix2 = ix + 1;
    const iz2 = iz + 1;

    const h11 = this.sampleCellHeight(ix1, iz1) * this.heightScale;
    const h21 = this.sampleCellHeight(ix2, iz1) * this.heightScale;
    const h12 = this.sampleCellHeight(ix1, iz2) * this.heightScale;
    const h22 = this.sampleCellHeight(ix2, iz2) * this.heightScale;

    const h1 = h11 * (1 - tx) + h21 * tx;
    const h2 = h12 * (1 - tx) + h22 * tx;
    return h1 * (1 - tz) + h2 * tz;
  }

  update(camera: THREE.Camera, delta: number): void {
    const camPos = new THREE.Vector3();
    camera.getWorldPosition(camPos);
    Grass.updateGlobalUniforms(delta, camPos, this.skyController);
    for (const ch of this.chunks.values()) ch.update(camera);
  }
}
