import * as THREE from 'three';
import { ImprovedNoise } from 'three/addons/math/ImprovedNoise.js';
import { SkyController } from './sky';
import { Water } from 'three/examples/jsm/objects/Water';

export class Terrain extends THREE.Group {
  private worldWidth = 200;
  private worldDepth = 200;
  private planeSize = 4096;
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
  private heightData: Float32Array;
  private terrainMesh: THREE.Mesh;
  private water: Water;
  private waterLevel = 16;

  constructor(skyController: SkyController) {
    super();

    this.heightData = this.generateHeight(this.worldWidth, this.worldDepth);

    const geometry = new THREE.PlaneGeometry(
      this.planeSize,
      this.planeSize,
      this.worldWidth - 1,
      this.worldDepth - 1,
    );
    geometry.rotateX(-Math.PI / 2);

    const vertices = geometry.attributes.position.array as Float32Array;
    const vertLength = vertices.length;
    let sampleIndex = 0;
    for (let vertIndex = 0; vertIndex < vertLength; vertIndex += 3) {
      vertices[vertIndex + 1] = this.heightData[sampleIndex] * this.heightScale;
      sampleIndex += 1;
    }

    const texture = new THREE.CanvasTexture(
      Terrain.generateTexture(
        this.heightData,
        this.worldWidth,
        this.worldDepth,
        this.textureScale,
      ),
    );
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.colorSpace = THREE.SRGBColorSpace;

    const material = new THREE.MeshPhongMaterial({ map: texture });
    this.terrainMesh = new THREE.Mesh(geometry, material);
    this.terrainMesh.receiveShadow = true;
    this.add(this.terrainMesh);

    // Create water plane owned by the Terrain group
    const waterGeometry = new THREE.PlaneGeometry(
      this.planeSize,
      this.planeSize,
    );
    const water = new Water(waterGeometry, {
      distortionScale: 3.7,
      fog: false,
      sunColor: new THREE.Color('white'),
      sunDirection: new THREE.Vector3(),
      textureHeight: 1024,
      textureWidth: 1024,
      waterColor: new THREE.Color('#001e0f'),
      waterNormals: new THREE.TextureLoader().load(
        new URL('textures/waternormals.jpg', import.meta.url).href,
        (waterTexture) => {
          waterTexture.wrapS = THREE.RepeatWrapping;
          waterTexture.wrapT = THREE.RepeatWrapping;
        },
      ),
    });
    water.rotation.x = -Math.PI / 2;
    water.position.y = this.waterLevel;
    water.material.uniforms.size.value = 11;
    water.material.uniforms.sunDirection.value
      .copy(skyController.sun)
      .normalize();
    this.water = water;
    this.add(this.water);
  }

  private generateHeight(width: number, depth: number) {
    const size = width * depth;
    const hill = new Float32Array(size);
    const detail = new Float32Array(size);
    const out = new Float32Array(size);
    const perlin = new ImprovedNoise();
    const z = this.seed;

    let hillMin = Infinity;
    let hillMax = -Infinity;
    let detailMin = Infinity;
    let detailMax = -Infinity;

    // Sample hill and detail noises into separate arrays
    for (let index = 0; index < size; index++) {
      const x = index % width;
      const y = Math.floor(index / width);

      let amp = 1;
      let freq = this.hillNoiseScale;
      let hValue = 0;
      for (let octave = 0; octave < this.hillOctaves; octave++) {
        hValue += perlin.noise(x * freq, y * freq, z) * amp;
        amp *= this.hillPersistence;
        freq *= this.lacunarity;
      }

      amp = 1;
      freq = this.detailNoiseScale;
      let dValue = 0;
      // Offset Z to decorrelate detail from hills
      const dz = z + 512;
      for (let octave = 0; octave < this.detailOctaves; octave++) {
        dValue += perlin.noise(x * freq, y * freq, dz) * amp;
        amp *= this.detailPersistence;
        freq *= this.lacunarity;
      }

      hill[index] = hValue;
      detail[index] = dValue;
      if (hValue < hillMin) hillMin = hValue;
      if (hValue > hillMax) hillMax = hValue;
      if (dValue < detailMin) detailMin = dValue;
      if (dValue > detailMax) detailMax = dValue;
    }

    // Normalize both to 0..1
    const hillRange = hillMax - hillMin || 1;
    const detailRange = detailMax - detailMin || 1;
    for (let index = 0; index < size; index++) {
      hill[index] = (hill[index] - hillMin) / hillRange;
      detail[index] = (detail[index] - detailMin) / detailRange;
    }

    // Combine using a mask derived from hill noise: low hills -> flat (suppress detail)
    const edge0 = this.flatThreshold - this.flatBlend;
    const edge1 = this.flatThreshold + this.flatBlend;
    for (let index = 0; index < size; index++) {
      const mask = Terrain.smoothStep(hill[index], edge0, edge1);
      // Combine: hills always present; details only where mask > 0
      out[index] =
        hill[index] * this.hillAmplitude +
        detail[index] * this.detailAmplitude * mask;
      // Apply exponent to accentuate peaks
      out[index] **= this.elevationExponent;
    }

    return out;
  }

  private static generateTexture(
    data: Float32Array,
    width: number,
    height: number,
    textureScale: number,
  ) {
    const vector3 = new THREE.Vector3(0, 0, 0);
    const sun = new THREE.Vector3(1, 1, 1).normalize();

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
      byte += 4, pixIndex++
    ) {
      vector3.x = (data[pixIndex - 2] || 0) - (data[pixIndex + 2] || 0);
      vector3.y = 2;
      vector3.z =
        (data[pixIndex - width * 2] || 0) - (data[pixIndex + width * 2] || 0);
      vector3.normalize();

      const shade = vector3.dot(sun);
      const heightValue = Math.max(0, Math.min(1, data[pixIndex] || 0));

      // Blend between low->mid->high based on height
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

      // Lighting factor from slope-based shade
      const lightFactor = Math.max(0.45, 0.7 + shade * 0.45);

      // Small per-pixel variation to simulate grass patches
      const variation = (Math.random() - 0.5) * 18;

      imageData[byte] = Math.min(
        255,
        Math.max(0, baseR * lightFactor + variation),
      );
      imageData[byte + 1] = Math.min(
        255,
        Math.max(0, baseG * lightFactor + variation),
      );
      imageData[byte + 2] = Math.min(
        255,
        Math.max(0, baseB * lightFactor + variation),
      );
    }

    context.putImageData(image, 0, 0);

    const canvasScaled = document.createElement('canvas');
    canvasScaled.width = Math.max(1, width * textureScale);
    canvasScaled.height = Math.max(1, height * textureScale);
    const contextScaled = canvasScaled.getContext('2d');
    if (!contextScaled) return canvasScaled;
    contextScaled.scale(textureScale, textureScale);
    contextScaled.drawImage(canvas, 0, 0);

    const image2 = contextScaled.getImageData(
      0,
      0,
      canvasScaled.width,
      canvasScaled.height,
    );
    const imageData2 = image2.data;
    const image2Length = imageData2.length;
    for (let byte2 = 0; byte2 < image2Length; byte2 += 4) {
      const noise = Math.trunc(Math.random() * 5);
      imageData2[byte2] += noise;
      imageData2[byte2 + 1] += noise;
      imageData2[byte2 + 2] += noise;
    }
    contextScaled.putImageData(image2, 0, 0);

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
    const half = this.planeSize / 2;
    const fx = ((x + half) / this.planeSize) * (this.worldWidth - 1);
    const fz = ((z + half) / this.planeSize) * (this.worldDepth - 1);
    const ix = Math.floor(fx);
    const iz = Math.floor(fz);
    const tx = fx - ix;
    const tz = fz - iz;

    const clamp = (value: number, max: number) =>
      Math.max(0, Math.min(value, max));
    const ix1 = clamp(ix, this.worldWidth - 1);
    const iz1 = clamp(iz, this.worldDepth - 1);
    const ix2 = clamp(ix + 1, this.worldWidth - 1);
    const iz2 = clamp(iz + 1, this.worldDepth - 1);

    const index11 = ix1 + iz1 * this.worldWidth;
    const index21 = ix2 + iz1 * this.worldWidth;
    const index12 = ix1 + iz2 * this.worldWidth;
    const index22 = ix2 + iz2 * this.worldWidth;

    const h11 = (this.heightData[index11] || 0) * this.heightScale;
    const h21 = (this.heightData[index21] || 0) * this.heightScale;
    const h12 = (this.heightData[index12] || 0) * this.heightScale;
    const h22 = (this.heightData[index22] || 0) * this.heightScale;

    const h1 = h11 * (1 - tx) + h21 * tx;
    const h2 = h12 * (1 - tx) + h22 * tx;
    return h1 * (1 - tz) + h2 * tz;
  }

  update(delta: number): void {
    (this.water.material.uniforms.time as THREE.IUniform<number>).value +=
      delta;
  }
}
