import * as THREE from 'three';
import { ChunkEntry } from './terrain-chunk';
import { NoiseGenerator } from './noise';
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
  smoothStep,
} from './terrain-utilities';

export type NoiseRanges = {
  hillMin: number;
  hillMax: number;
  detailMin: number;
  detailMax: number;
};
export type ChunkFactoryParameters = {
  chunkSize: number;
  cellSize: number;
  heightScale: number;
  waterLevel: number;
  seed: number;
  lacunarity: number;
  hillOctaves: number;
  detailOctaves: number;
  hillPersistence: number;
  detailPersistence: number;
  hillNoiseScale: number;
  detailNoiseScale: number;
  hillAmplitude: number;
  detailAmplitude: number;
  elevationExponent: number;
  flatThreshold: number;
  flatBlend: number;
  noiseGenerator: NoiseGenerator;
  noiseRanges: NoiseRanges;
  baseTrees: THREE.LOD[];
  treeNoiseOctaves: number;
  treeNoisePersistence: number;
  treeNoiseScale: number;
  maxTreesPerChunk: number;
  maxDaisiesPerChunk: number;
  flowerNoiseScale: number;
};
export function generateHeight(
  width: number,
  depth: number,
  parameters: ChunkFactoryParameters,
  offsetX = 0,
  offsetZ = 0,
) {
  const size = width * depth;
  const out = new Float32Array(size);
  const nr = parameters.noiseRanges;
  const hillRange = nr.hillMax - nr.hillMin || 1;
  const detailRange = nr.detailMax - nr.detailMin || 1;
  const edge0 = parameters.flatThreshold - parameters.flatBlend;
  const edge1 = parameters.flatThreshold + parameters.flatBlend;

  let sampleIndex = 0;
  for (let dz = 0; dz < depth; dz += 1) {
    const y = offsetZ + dz;
    for (let dx = 0; dx < width; dx += 1) {
      const x = offsetX + dx;

      const hRaw = parameters.noiseGenerator.sampleOctaves(x, y, {
        lacunarity: parameters.lacunarity,
        octaves: parameters.hillOctaves,
        offsetZ: parameters.seed,
        persistence: parameters.hillPersistence,
        scale: parameters.hillNoiseScale,
      });

      const hillNorm = (hRaw - nr.hillMin) / hillRange;

      const mask = smoothStep(hillNorm, edge0, edge1);
      let detailNorm = 0;
      if (mask > 0) {
        const dRaw = parameters.noiseGenerator.sampleOctaves(x, y, {
          lacunarity: parameters.lacunarity,
          octaves: parameters.detailOctaves,
          offsetZ: parameters.seed + 512,
          persistence: parameters.detailPersistence,
          scale: parameters.detailNoiseScale,
        });
        detailNorm = (dRaw - nr.detailMin) / detailRange;
      }

      const combined =
        hillNorm * parameters.hillAmplitude +
        detailNorm * parameters.detailAmplitude * mask;
      const clamped = Math.max(0, combined);
      out[sampleIndex] = clamped ** parameters.elevationExponent;
      sampleIndex += 1;
    }
  }

  return out;
}

export function createChunkEntry(
  cx: number,
  cz: number,
  parameters: ChunkFactoryParameters,
): ChunkEntry {
  const offsetX = cx * parameters.chunkSize;
  const offsetZ = cz * parameters.chunkSize;
  const cw = parameters.chunkSize + 1;
  const cd = parameters.chunkSize + 1;

  const heightData = generateHeight(cw, cd, parameters, offsetX, offsetZ);
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
      cellSize: parameters.cellSize,
      heightScale: parameters.heightScale,
    });

  colorGeometry({
    geometry,
    centerX,
    centerZ,
    cellSize: parameters.cellSize,
    waterLevel: parameters.waterLevel,
    seed: parameters.seed,
    noiseGenerator: parameters.noiseGenerator,
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
    cellSize: parameters.cellSize,
    heightScale: parameters.heightScale,
  });

  const grass = createGrassForChunk({
    centerX,
    centerZ,
    sample: sampleFromHeightData,
    width: chunkPlaneWidth,
    waterLevel: parameters.waterLevel,
  });

  const trees = generateTreesForChunk({
    baseTrees: parameters.baseTrees,
    centerX,
    centerZ,
    chunkPlaneWidth,
    chunkPlaneDepth,
    sampleFromHeightData,
    cellSize: parameters.cellSize,
    noiseGenerator: parameters.noiseGenerator,
    lacunarity: parameters.lacunarity,
    treeNoiseOctaves: parameters.treeNoiseOctaves,
    seed: parameters.seed,
    treeNoisePersistence: parameters.treeNoisePersistence,
    treeNoiseScale: parameters.treeNoiseScale,
    maxTreesPerChunk: parameters.maxTreesPerChunk,
    waterLevel: parameters.waterLevel,
  });

  const flowers = generateFlowersForChunk({
    centerX,
    centerZ,
    chunkPlaneWidth,
    chunkPlaneDepth,
    sampleFromHeightData,
    cellSize: parameters.cellSize,
    waterLevel: parameters.waterLevel,
    maxDaisiesPerChunk: parameters.maxDaisiesPerChunk,
    flowerNoiseScale: parameters.flowerNoiseScale,
    noiseGenerator: parameters.noiseGenerator,
    seed: parameters.seed,
  });

  const objects = [...trees, ...flowers];

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

  return entry;
}
