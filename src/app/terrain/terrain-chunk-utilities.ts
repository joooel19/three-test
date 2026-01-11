import * as THREE from 'three';
import { Grass } from './grass/grass';
import { NoiseGenerator } from './noise';
import { Daisy } from './flowers/daisy';
import { AnemoneFlower } from './flowers/anemone-flower';
import { CrocusFlower } from './flowers/crocus-flower';
import { DaffodilFlower } from './flowers/daffodil-flower';
import { DandelionFlower } from './flowers/dandelion-flower';
import { SnowdropFlower } from './flowers/snowdrop-flower';
import { Rock } from './flowers/rock';

export function makeSampleFromHeightData(options: {
  heightData: Float32Array;
  cw: number;
  cd: number;
  offsetX: number;
  offsetZ: number;
  cellSize: number;
  heightScale: number;
}) {
  const { heightData, cw, cd, offsetX, offsetZ, cellSize, heightScale } =
    options;

  return (x: number, z: number) => {
    const fx = x / cellSize;
    const fz = z / cellSize;
    const ix = Math.floor(fx);
    const iz = Math.floor(fz);
    const tx = fx - ix;
    const tz = fz - iz;
    const lx = ix - offsetX;
    const lz = iz - offsetZ;
    if (lx < 0 || lz < 0 || lx + 1 >= cw || lz + 1 >= cd) return 0;
    const index11 = lx + lz * cw;
    const index21 = lx + 1 + lz * cw;
    const index12 = lx + (lz + 1) * cw;
    const index22 = lx + 1 + (lz + 1) * cw;
    const h11 = heightData[index11] || 0;
    const h21 = heightData[index21] || 0;
    const h12 = heightData[index12] || 0;
    const h22 = heightData[index22] || 0;
    const h1 = h11 * (1 - tx) + h21 * tx;
    const h2 = h12 * (1 - tx) + h22 * tx;
    return (h1 * (1 - tz) + h2 * tz) * heightScale;
  };
}

export function createGrassForChunk(options: {
  centerX: number;
  centerZ: number;
  sample: (x: number, z: number) => number;
  width: number;
  waterLevel: number;
}) {
  return new Grass({
    bladeCount: 100_000,
    centerX: options.centerX,
    centerZ: options.centerZ,
    sampleHeight: options.sample,
    waterLevel: options.waterLevel,
    width: options.width,
  });
}

export function generateTreesForChunk(options: {
  baseTrees: THREE.LOD[];
  centerX: number;
  centerZ: number;
  chunkPlaneWidth: number;
  chunkPlaneDepth: number;
  sampleFromHeightData: (x: number, z: number) => number;
  cellSize: number;
  noiseGenerator: NoiseGenerator;
  lacunarity: number;
  treeNoiseOctaves: number;
  seed: number;
  treeNoisePersistence: number;
  treeNoiseScale: number;
  maxTreesPerChunk: number;
  waterLevel: number;
}) {
  const objects: THREE.Object3D[] = [];
  if (options.baseTrees.length === 0) return objects;
  const tx = options.centerX / options.cellSize;
  const tz = options.centerZ / options.cellSize;
  const treeNoiseOptions = {
    lacunarity: options.lacunarity,
    octaves: options.treeNoiseOctaves,
    offsetZ: options.seed + 2048,
    persistence: options.treeNoisePersistence,
    scale: options.treeNoiseScale,
  } as const;
  const tRaw = options.noiseGenerator.sampleOctaves(tx, tz, treeNoiseOptions);
  let amp = 1;
  let ampSum = 0;
  for (let index = 0; index < options.treeNoiseOctaves; index += 1) {
    ampSum += amp;
    amp *= options.treeNoisePersistence;
  }
  const densityNormalized = Math.max(
    0,
    Math.min(1, (tRaw / (ampSum || 1) + 1) * 0.5),
  );
  let treeCount = 0;
  // Replicate original density threshold behaviour; choose full count on high density
  const treeHighThreshold = 0.6;
  if (densityNormalized > treeHighThreshold)
    treeCount = Math.floor(options.maxTreesPerChunk);
  const margin = options.cellSize;
  for (let ti = 0; ti < treeCount; ti += 1) {
    const rx =
      Math.random() * (options.chunkPlaneWidth - margin * 2) -
      (options.chunkPlaneWidth / 2 - margin);
    const rz =
      Math.random() * (options.chunkPlaneDepth - margin * 2) -
      (options.chunkPlaneDepth / 2 - margin);
    const worldX = options.centerX + rx;
    const worldZ = options.centerZ + rz;
    const y = options.sampleFromHeightData(worldX, worldZ);
    if (y <= options.waterLevel + 12) continue;
    const pickIndex =
      Math.floor(Math.random() * options.baseTrees.length) %
      options.baseTrees.length;
    const prototype = options.baseTrees[pickIndex];
    const treeClone = prototype.clone(true);
    const scaleFactor = 0.6 + Math.random();
    treeClone.scale.set(scaleFactor, scaleFactor, scaleFactor);
    treeClone.position.set(worldX, y, worldZ);
    objects.push(treeClone);
  }
  return objects;
}

export function generateFlowersForChunk(options: {
  centerX: number;
  centerZ: number;
  chunkPlaneWidth: number;
  chunkPlaneDepth: number;
  sampleFromHeightData: (x: number, z: number) => number;
  cellSize: number;
  waterLevel: number;
  maxDaisiesPerChunk: number;
  flowerNoiseScale: number;
  noiseGenerator: NoiseGenerator;
  seed: number;
}) {
  const objects: THREE.Object3D[] = [];
  const flowerNoiseOptions = {
    lacunarity: 2,
    octaves: 2,
    offsetZ: options.seed + 4096,
    persistence: 0.5,
    scale: options.flowerNoiseScale,
  } as const;
  const fRaw = options.noiseGenerator.sampleOctaves(
    options.centerX / options.cellSize,
    options.centerZ / options.cellSize,
    flowerNoiseOptions,
  );
  const ampSum = 1 + 0.5;
  const density = Math.max(0, Math.min(1, (fRaw / ampSum + 1) * 0.5));
  const flowersCount = Math.floor(density * options.maxDaisiesPerChunk);
  const flowerMargin = options.cellSize * 0.5;
  const flowerConstructors: Array<new (s: number) => THREE.Object3D> = [
    Daisy,
    AnemoneFlower,
    CrocusFlower,
    DaffodilFlower,
    DandelionFlower,
    SnowdropFlower,
    Rock,
  ];
  for (let fi = 0; fi < flowersCount; fi += 1) {
    const rx =
      Math.random() * (options.chunkPlaneWidth - flowerMargin * 2) -
      (options.chunkPlaneWidth / 2 - flowerMargin);
    const rz =
      Math.random() * (options.chunkPlaneDepth - flowerMargin * 2) -
      (options.chunkPlaneDepth / 2 - flowerMargin);
    const worldX = options.centerX + rx;
    const worldZ = options.centerZ + rz;
    const y = options.sampleFromHeightData(worldX, worldZ);
    if (y <= options.waterLevel + 12) continue;
    const hNeighbor = options.sampleFromHeightData(
      worldX + options.cellSize,
      worldZ,
    );
    const slope = Math.abs(hNeighbor - y) / options.cellSize;
    if (slope > 0.6) continue;
    const scaleFactor = 0.8 + Math.random() * 0.4;
    const pickIndex = Math.floor(Math.random() * flowerConstructors.length);
    const ChosenFlower = flowerConstructors[pickIndex];
    const flowerObject: THREE.Object3D = new ChosenFlower(scaleFactor);
    flowerObject.position.set(worldX, y, worldZ);
    objects.push(flowerObject);
  }
  return objects;
}
