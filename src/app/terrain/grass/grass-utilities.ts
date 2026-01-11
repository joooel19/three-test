import * as THREE from 'three';

export function populateInstanceAttributes(options: {
  instances: number;
  indices: Float32Array;
  offsets: Float32Array;
  scales: Float32Array;
  halfRootAngles: Float32Array;
  width: number;
  centerX: number;
  centerZ: number;
  sampleHeight: (x: number, z: number) => number;
  waterLevel: number;
}) {
  const {
    instances,
    indices,
    offsets,
    scales,
    halfRootAngles,
    width,
    centerX,
    centerZ,
    sampleHeight,
    waterLevel,
  } = options;
  let placedCount = 0;
  const cutoff = waterLevel + 12;
  const fuzz = 12;
  const fuzzHalf = fuzz * 0.5;
  const instancesLocal = instances;

  for (let index = 0; index < instancesLocal; index++) {
    indices[index] = index / instancesLocal;
    const x = Math.random() * width - width / 2;
    const z = Math.random() * width - width / 2;
    const y = sampleHeight(centerX + x, centerZ + z);

    const posNoise = (() => {
      const ax = centerX + x;
      const bz = centerZ + z;
      const noiseSeed = Math.sin(ax * 12.9898 + bz * 78.233) * 43_758;
      return noiseSeed - Math.floor(noiseSeed);
    })();

    const placementProb = ((): number => {
      let tv =
        (y - (cutoff - fuzzHalf)) /
        (cutoff + fuzzHalf - (cutoff - fuzzHalf) || 1);
      if (tv < 0) tv = 0;
      if (tv > 1) tv = 1;
      return tv * tv * (3 - 2 * tv);
    })();

    const place = posNoise < placementProb;
    if (!place) continue;

    const offsetBase = placedCount * 3;
    offsets[offsetBase + 0] = x;
    offsets[offsetBase + 1] = y;
    offsets[offsetBase + 2] = z;
    const angleRoot = Math.PI - Math.random() * (2 * Math.PI);
    const halfBase = placedCount * 2;
    halfRootAngles[halfBase + 0] = Math.sin(0.5 * angleRoot);
    halfRootAngles[halfBase + 1] = Math.cos(0.5 * angleRoot);
    scales[placedCount] =
      index % 3 !== 0 ? 2 + Math.random() * 1.25 : 2 + Math.random();
    placedCount++;
  }

  return placedCount;
}

export function computeBoundingSphere(
  instancedGeometry: THREE.InstancedBufferGeometry,
  options: {
    width: number;
    bladeWidth: number;
    bladeHeight: number;
    centerX: number;
    centerZ: number;
    sampleHeight: (x: number, z: number) => number;
  },
) {
  const { width, bladeWidth, bladeHeight, centerX, centerZ, sampleHeight } =
    options;
  const halfW = width * 0.5;
  const samples: Array<[number, number]> = [
    [-halfW, -halfW],
    [halfW, -halfW],
    [-halfW, halfW],
    [halfW, halfW],
    [0, 0],
    [-halfW, 0],
    [halfW, 0],
    [0, -halfW],
    [0, halfW],
  ];

  let minY = Infinity;
  let maxY = -Infinity;
  for (let si = 0; si < samples.length; si++) {
    const sx = centerX + samples[si][0];
    const sz = centerZ + samples[si][1];
    const sy = sampleHeight(sx, sz);
    if (sy < minY) minY = sy;
    if (sy > maxY) maxY = sy;
  }

  if (!Number.isFinite(minY)) minY = 0;
  if (!Number.isFinite(maxY)) maxY = 0;

  const minX = -halfW;
  const maxX = halfW;
  const minZ = -halfW;
  const maxZ = halfW;
  const cx = (minX + maxX) * 0.5;
  const cy = (minY + maxY) * 0.5 + bladeHeight * 0.5;
  const cz = (minZ + maxZ) * 0.5;
  const dx = Math.max(Math.abs(minX - cx), Math.abs(maxX - cx));
  const dz = Math.max(Math.abs(minZ - cz), Math.abs(maxZ - cz));
  const dy = Math.max(Math.abs(minY - cy), Math.abs(maxY - cy));
  let radius = Math.hypot(dx, dy, dz) + Math.hypot(bladeWidth, bladeHeight);
  const minRadius = Math.hypot(halfW, bladeHeight) + 1;
  if (radius < minRadius) radius = minRadius;
  instancedGeometry.boundingSphere = new THREE.Sphere(
    new THREE.Vector3(cx, cy, cz),
    radius,
  );
}
