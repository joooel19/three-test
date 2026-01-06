import * as THREE from 'three';
import { ChunkEntry, TerrainChunk } from './terrain-chunk';
import { CloudVolume } from './cloud';
import { GrassChunk } from './grass-chunk';
import { NoiseGenerator } from './noise';
import { SkyController } from './sky';
import { WaterFactory } from './water-factory';

export class Terrain extends THREE.Group {
  private chunkSize = 16;
  private heightScale = 36;
  private lacunarity = 2;
  private seed = 42;
  private textureScale = 4;
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
  private waterNormals: THREE.Texture;
  private waterLevel = 16;
  private waterFactory: WaterFactory;
  private skyController: SkyController;

  constructor(skyController: SkyController) {
    super();
    this.skyController = skyController;
    this.noiseGenerator = new NoiseGenerator();
    const sampleChunks = 4;
    this.noiseRanges = this.computeNoiseRanges(
      this.chunkSize * sampleChunks,
      this.chunkSize * sampleChunks,
    );
    // Load shared water normals texture once for all chunk waters
    this.waterNormals = new THREE.TextureLoader().load(
      new URL('textures/waternormals.jpg', import.meta.url).href,
      (waterTexture) => {
        waterTexture.wrapS = THREE.RepeatWrapping;
        waterTexture.wrapT = THREE.RepeatWrapping;
      },
    );

    this.waterFactory = new WaterFactory(this.waterNormals, this.skyController);

    // Load an initial area around origin (player at 0,0)
    this.updateChunks(0, 0, 1);
    // With the new mapping, cell (0,0) sits at world position (0,0).
    const gx0 = 0 / this.cellSize;
    const gz0 = 0 / this.cellSize;
    this.lastChunkX = Math.floor(gx0 / this.chunkSize);
    this.lastChunkZ = Math.floor(gz0 / this.chunkSize);
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
        const mask = Terrain.smoothStep(hillNorm, edge0, edge1);
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
    const key = Terrain.makeKey(cx, cz);
    const chunk = this.chunks.get(key);
    if (!chunk) return 0;
    return chunk.sampleCellHeight(ix, iz);
  }

  private static makeKey(cx: number, cz: number) {
    return [cx, cz].join(',');
  }

  private createChunk(cx: number, cz: number) {
    const offsetX = cx * this.chunkSize;
    const offsetZ = cz * this.chunkSize;
    // Always generate full chunk grid; allow streaming beyond initial world bounds
    const cw = this.chunkSize + 1;
    const cd = this.chunkSize + 1;

    const heightData = this.generateHeight(cw, cd, offsetX, offsetZ);

    // Validate height data to avoid NaNs in geometry
    for (let hi = 0; hi < heightData.length; hi += 1) {
      const value = heightData[hi];
      if (!Number.isFinite(value)) {
        console.warn('Terrain: non-finite heightData at', cx, cz, hi, value);
        heightData[hi] = 0;
      } else if (value < 0) {
        heightData[hi] = 0;
      }
    }

    const chunkPlaneWidth = (cw - 1) * this.cellSize;
    const chunkPlaneDepth = (cd - 1) * this.cellSize;

    const geometry = new THREE.PlaneGeometry(
      chunkPlaneWidth,
      chunkPlaneDepth,
      cw - 1,
      cd - 1,
    );
    geometry.rotateX(-Math.PI / 2);

    const vertices = geometry.attributes.position.array as Float32Array;
    const vertLength = vertices.length;
    let sampleIndex = 0;
    for (let vertIndex = 0; vertIndex < vertLength; vertIndex += 3) {
      vertices[vertIndex + 1] = heightData[sampleIndex] * this.heightScale;
      sampleIndex += 1;
    }

    // Ensure normals reflect displaced vertices
    geometry.attributes.position.needsUpdate = true;
    geometry.computeVertexNormals();
    const normalAttribute = geometry.attributes.normal as
      | THREE.BufferAttribute
      | undefined;
    if (normalAttribute) normalAttribute.needsUpdate = true;

    const texture = new THREE.CanvasTexture(
      Terrain.generateTexture(heightData, cw, cd, this.textureScale),
    );
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.colorSpace = THREE.SRGBColorSpace;

    const material = new THREE.MeshPhongMaterial({ map: texture });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.receiveShadow = true;

    const centerX = (offsetX + (cw - 1) / 2) * this.cellSize;
    const centerZ = (offsetZ + (cd - 1) / 2) * this.cellSize;
    mesh.position.set(centerX, 0, centerZ);
    // Create a water plane for this chunk
    const water = this.waterFactory.create(
      chunkPlaneWidth,
      chunkPlaneDepth,
      centerX,
      centerZ,
      this.waterLevel,
    );
    water.rotation.x = -Math.PI / 2;
    // Position water at same horizontal center as chunk, and at configured level
    water.position.set(centerX, this.waterLevel, centerZ);
    water.material.uniforms.size.value = 2;
    water.material.uniforms.sunDirection.value
      .copy(this.skyController.sun)
      .normalize();

    const rand = (min: number, max: number) =>
      Math.random() * (max - min) + min;
    const clouds = Array.from(
      { length: 2 },
      () =>
        new CloudVolume(
          new THREE.Vector3(
            centerX + rand(-chunkPlaneWidth * 0.25, chunkPlaneWidth * 0.25),
            rand(320, 460),
            centerZ + rand(-chunkPlaneDepth * 0.25, chunkPlaneDepth * 0.25),
          ),
        ),
    );
    const sampleFromHeightData = (x: number, z: number) => {
      // Map world coords to chunk-local sample grid (floating)
      const fx = x / this.cellSize;
      const fz = z / this.cellSize;
      const ix = Math.floor(fx);
      const iz = Math.floor(fz);
      const tx = fx - ix;
      const tz = fz - iz;

      const lx = ix - offsetX;
      const lz = iz - offsetZ;
      // If any of the four surrounding samples are outside the chunk, return 0
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
      return (h1 * (1 - tz) + h2 * tz) * this.heightScale;
    };

    const grass = new GrassChunk({
      bladeCount: 100_000,
      centerX,
      centerZ,
      depth: chunkPlaneDepth,
      sampleHeight: sampleFromHeightData,
      waterLevel: this.waterLevel,
      width: chunkPlaneWidth,
    });

    const key = Terrain.makeKey(cx, cz);
    const entry: ChunkEntry = {
      clouds,
      depth: cd,
      grass,
      heightData,
      mesh,
      offsetX,
      offsetZ,
      water,
      width: cw,
    };
    const chunk = new TerrainChunk(entry);
    chunk.addTo(this);
    this.chunks.set(key, chunk);
  }

  private disposeChunk(cx: number, cz: number) {
    const key = Terrain.makeKey(cx, cz);
    const chunk = this.chunks.get(key);
    if (!chunk) return;
    chunk.dispose(this);
    this.chunks.delete(key);
  }

  public updateChunks(playerX: number, playerZ: number, radius = 1) {
    // Map world coordinates to grid cell coordinates (cell size units)
    const gx = playerX / this.cellSize;
    const gz = playerZ / this.cellSize;
    const centerCX = Math.floor(gx / this.chunkSize);
    const centerCZ = Math.floor(gz / this.chunkSize);

    const wanted = new Set<string>();
    const side = radius * 2 + 1;
    const total = side * side;
    for (let index = 0; index < total; index += 1) {
      const dx = (index % side) - radius;
      const dz = Math.floor(index / side) - radius;
      const cx = centerCX + dx;
      const cz = centerCZ + dz;
      const key = Terrain.makeKey(cx, cz);
      wanted.add(key);
      if (!this.chunks.has(key)) this.createChunk(cx, cz);
    }
    // Dispose chunks not wanted
    for (const key of this.chunks.keys())
      if (!wanted.has(key)) {
        const [sx, sz] = key.split(',').map(Number);
        this.disposeChunk(sx, sz);
      }
  }

  public updatePlayerPosition(position: THREE.Vector3) {
    const gx = position.x / this.cellSize;
    const gz = position.z / this.cellSize;
    const cx = Math.floor(gx / this.chunkSize);
    const cz = Math.floor(gz / this.chunkSize);
    if (this.lastChunkX !== cx || this.lastChunkZ !== cz) {
      this.lastChunkX = cx;
      this.lastChunkZ = cz;
      this.updateChunks(position.x, position.z, 1);
    }
  }

  private computeNoiseRanges(width: number, depth: number) {
    let hillMin = Infinity;
    let hillMax = -Infinity;
    let detailMin = Infinity;
    let detailMax = -Infinity;
    const startX = -Math.floor(width / 2);
    const startY = -Math.floor(depth / 2);

    // Use nested loops to avoid per-iteration modulo and floor operations.
    for (let dz = 0; dz < depth; dz += 1) {
      const y = startY + dz;
      for (let dx = 0; dx < width; dx += 1) {
        const x = startX + dx;

        const hValue = this.noiseGenerator.sampleOctaves(x, y, {
          lacunarity: this.lacunarity,
          octaves: this.hillOctaves,
          offsetZ: this.seed,
          persistence: this.hillPersistence,
          scale: this.hillNoiseScale,
        });

        const dValue = this.noiseGenerator.sampleOctaves(x, y, {
          lacunarity: this.lacunarity,
          octaves: this.detailOctaves,
          offsetZ: this.seed + 512,
          persistence: this.detailPersistence,
          scale: this.detailNoiseScale,
        });

        if (hValue < hillMin) hillMin = hValue;
        if (hValue > hillMax) hillMax = hValue;
        if (dValue < detailMin) detailMin = dValue;
        if (dValue > detailMax) detailMax = dValue;
      }
    }

    return { detailMax, detailMin, hillMax, hillMin };
  }

  private static generateTexture(
    data: Float32Array,
    width: number,
    height: number,
    textureScale: number,
  ) {
    // Color will be computed solely from height to avoid per-chunk lighting differences

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) return canvas;

    context.fillStyle = '#000';
    context.fillRect(0, 0, width, height);

    const image = context.getImageData(0, 0, canvas.width, canvas.height);
    const imageData = image.data;

    const imageLength = imageData.length;
    // Define grass color stops: low (dirt), mid (dark green), high (light green)
    const lowColor = [80, 58, 22];
    const midColor = [48, 115, 35];
    const highColor = [160, 200, 120];
    // Use Terrain.lerpNumbers helper below

    for (
      let byte = 0, pixIndex = 0;
      byte < imageLength;
      byte += 4, pixIndex += 1
    ) {
      const heightValue = Math.max(0, Math.min(1, data[pixIndex] || 0));

      // Blend between low->mid->high based on height only
      let baseB: number, baseG: number, baseR: number;
      if (heightValue < 0.5) {
        const weight = heightValue * 2;
        baseR = Terrain.lerpNumbers(lowColor[0], midColor[0], weight);
        baseG = Terrain.lerpNumbers(lowColor[1], midColor[1], weight);
        baseB = Terrain.lerpNumbers(lowColor[2], midColor[2], weight);
      } else {
        const weight = (heightValue - 0.5) * 2;
        baseR = Terrain.lerpNumbers(midColor[0], highColor[0], weight);
        baseG = Terrain.lerpNumbers(midColor[1], highColor[1], weight);
        baseB = Terrain.lerpNumbers(midColor[2], highColor[2], weight);
      }

      // Simple height-based brightness to avoid slope-dependent differences
      const lightFactor = 0.85 + heightValue * 0.15;

      imageData[byte] = Math.min(255, Math.max(0, baseR * lightFactor));
      imageData[byte + 1] = Math.min(255, Math.max(0, baseG * lightFactor));
      imageData[byte + 2] = Math.min(255, Math.max(0, baseB * lightFactor));
    }

    context.putImageData(image, 0, 0);

    const canvasScaled = document.createElement('canvas');
    canvasScaled.width = Math.max(1, width * textureScale);
    canvasScaled.height = Math.max(1, height * textureScale);
    const contextScaled = canvasScaled.getContext('2d');
    if (!contextScaled) return canvasScaled;
    contextScaled.imageSmoothingEnabled = true;
    contextScaled.drawImage(
      canvas,
      0,
      0,
      canvasScaled.width,
      canvasScaled.height,
    );

    return canvasScaled;
  }

  private static smoothStep(value: number, edgeLo: number, edgeHi: number) {
    const tval = Math.max(
      0,
      Math.min(1, (value - edgeLo) / (edgeHi - edgeLo || 1)),
    );
    return tval * tval * (3 - 2 * tval);
  }

  private static lerpNumbers(
    fromValue: number,
    toValue: number,
    weight: number,
  ) {
    return fromValue + (toValue - fromValue) * weight;
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
    for (const ch of this.chunks.values())
      ch.update(camera, delta, this.skyController);
  }
}
