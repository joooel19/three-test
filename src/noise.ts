import { ImprovedNoise } from 'three/addons/math/ImprovedNoise.js';

export interface MultiOctaveOptions {
  octaves: number;
  scale: number;
  persistence: number;
  lacunarity: number;
  offsetZ: number;
}

export class NoiseGenerator {
  private perlin: ImprovedNoise;

  constructor() {
    this.perlin = new ImprovedNoise();
  }

  sampleOctaves(x: number, y: number, options: MultiOctaveOptions) {
    let amp = 1;
    let freq = options.scale;
    let value = 0;
    for (let index = 0; index < options.octaves; index += 1) {
      value += this.perlin.noise(x * freq, y * freq, options.offsetZ) * amp;
      amp *= options.persistence;
      freq *= options.lacunarity;
    }
    return value;
  }
}
