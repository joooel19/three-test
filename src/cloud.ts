import * as THREE from 'three';
import { ImprovedNoise } from 'three/examples/jsm/math/ImprovedNoise.js';

function getRandomArbitrary(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

export class CloudVolume extends THREE.Mesh {
  private static readonly color: string = '#fff';

  constructor(angle: number, radius: number) {
    const perlin = new ImprovedNoise();

    const size = 64;
    const width = size;
    const height = size;
    const depth = size;

    const data = new Uint8Array(width * height * depth);
    let index = 0;
    const scale = 0.05;
    const vector = new THREE.Vector3();

    const total = width * height * depth;
    for (let flatIndex = 0; flatIndex < total; flatIndex += 1) {
      const x = flatIndex % width;
      const y = Math.floor((flatIndex / width) % height);
      const z = Math.floor(flatIndex / (width * height));
      const density =
        1 -
        vector
          .set(x, y, z)
          .subScalar(size / 2)
          .divideScalar(size)
          .length();
      const noise = 128 + 128 * perlin.noise(x * scale, y * scale, z * scale);
      data[index] = Math.max(
        0,
        Math.min(255, Math.floor(noise * density * density)),
      );
      index += 1;
    }

    const texture = new THREE.Data3DTexture(data, width, height, depth);
    texture.format = THREE.RedFormat;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.unpackAlignment = 1;
    texture.needsUpdate = true;

    const vertexShader = `
      in vec3 position;
      uniform mat4 modelMatrix;
      uniform mat4 modelViewMatrix;
      uniform mat4 projectionMatrix;
      uniform vec3 cameraPos;
      out vec3 vOrigin;
      out vec3 vDirection;
      void main() {
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vOrigin = vec3(inverse(modelMatrix) * vec4(cameraPos, 1.0)).xyz;
        vDirection = position - vOrigin;
        gl_Position = projectionMatrix * mvPosition;
      }
    `;

    const fragmentShader = `
      precision highp float;
      precision highp sampler3D;
      in vec3 vOrigin;
      in vec3 vDirection;
      out vec4 color;
      uniform vec3 base;
      uniform sampler3D map;
      uniform float threshold;
      uniform float range;
      uniform float opacity;
      uniform float steps;
      uniform float frame;

      vec2 hitBox(vec3 orig, vec3 dir) {
        vec3 box_min = vec3(-0.5);
        vec3 box_max = vec3(0.5);
        vec3 inv_dir = 1.0 / dir;
        vec3 tmin_tmp = (box_min - orig) * inv_dir;
        vec3 tmax_tmp = (box_max - orig) * inv_dir;
        vec3 tmin = min(tmin_tmp, tmax_tmp);
        vec3 tmax = max(tmin_tmp, tmax_tmp);
        float t0 = max(tmin.x, max(tmin.y, tmin.z));
        float t1 = min(tmax.x, min(tmax.y, tmax.z));
        return vec2(t0, t1);
      }

      float sample1(vec3 p) {
        return texture(map, p).r;
      }

      float shading(vec3 coord) {
        float step = 0.01;
        return sample1(coord + vec3(-step)) - sample1(coord + vec3(step));
      }

      vec4 linearToSRGB(in vec4 value) {
        return vec4(mix(pow(value.rgb, vec3(0.41666)) * 1.055 - vec3(0.055), value.rgb * 12.92, vec3(lessThanEqual(value.rgb, vec3(0.0031308)))), value.a);
      }

      void main() {
        vec3 rayDir = normalize(vDirection);
        vec2 bounds = hitBox(vOrigin, rayDir);
        if (bounds.x > bounds.y) discard;
        bounds.x = max(bounds.x, 0.0);
        float stepSize = (bounds.y - bounds.x) / steps;

        uint seed = uint(gl_FragCoord.x) * uint(1973) + uint(gl_FragCoord.y) * uint(9277) + uint(frame) * uint(26699);
        vec3 size = vec3(textureSize(map, 0));
        float randNum = float(seed % 100u) / 100.0 * 2.0 - 1.0;
        vec3 p = vOrigin + bounds.x * rayDir;
        p += rayDir * randNum * (1.0 / size);

        vec4 ac = vec4(base, 0.0);

        for (float i = 0.0; i < steps; i += 1.0) {
          float t = bounds.x + i * stepSize;
          float d = sample1(p + 0.5);
          d = smoothstep(threshold - range, threshold + range, d) * opacity;
          float col = shading(p + 0.5) * 3.0 + ((p.x + p.y) * 0.25) + 0.2;
          ac.rgb += (1.0 - ac.a) * d * col;
          ac.a += (1.0 - ac.a) * d;
          if (ac.a >= 0.95) break;
          p += rayDir * stepSize;
        }

        color = linearToSRGB(ac);
        if (color.a == 0.0) discard;
      }
    `;

    const material = new THREE.RawShaderMaterial({
      fragmentShader,
      glslVersion: THREE.GLSL3,
      side: THREE.BackSide,
      transparent: true,
      uniforms: {
        base: { value: new THREE.Color(CloudVolume.color) },
        cameraPos: { value: new THREE.Vector3() },
        frame: { value: 0 },
        map: { value: texture },
        opacity: { value: 0.1 },
        range: { value: 0.1 },
        steps: { value: 10 },
        threshold: { value: getRandomArbitrary(0.2, 0.4) },
      },
      vertexShader,
    });

    const geometry = new THREE.BoxGeometry(1, 1, 1);
    super(geometry, material);
    this.scale.set(
      getRandomArbitrary(100, 300),
      getRandomArbitrary(16, 48),
      getRandomArbitrary(100, 260),
    );
    this.position.set(
      Math.cos(angle) * radius,
      getRandomArbitrary(220, 360),
      Math.sin(angle) * radius,
    );
  }

  public update(camera: THREE.Camera): void {
    const mat = this.material as THREE.RawShaderMaterial;
    mat.uniforms.cameraPos.value.copy(camera.position);
    mat.uniforms.frame.value = (mat.uniforms.frame.value as number) + 1;
  }
}
