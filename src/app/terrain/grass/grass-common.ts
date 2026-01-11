import * as THREE from 'three';
import { grassFragmentSource, grassVertexSource } from './grass-shaders';
import {
  populateInstanceAttributes,
  computeBoundingSphere,
} from './grass-utilities';
export {
  populateInstanceAttributes,
  computeBoundingSphere,
} from './grass-utilities';

let baseGeometry: THREE.PlaneGeometry | null = null;
let farBaseGeometry: THREE.PlaneGeometry | null = null;
let crossBaseGeometry: THREE.BufferGeometry | null = null;
let sharedMaterial: THREE.RawShaderMaterial | null = null;
let sharedGrassTexture: THREE.Texture | null = null;
let sharedAlphaMap: THREE.Texture | null = null;

export function createFarBase(bladeWidth: number, bladeHeight: number) {
  if (!farBaseGeometry) {
    farBaseGeometry = new THREE.PlaneGeometry(bladeWidth, bladeHeight, 1, 1);
    farBaseGeometry.translate(0, bladeHeight / 2, 0);
    farBaseGeometry.computeVertexNormals();
  }
  return farBaseGeometry;
}

export function createCrossBase(bladeWidth: number, bladeHeight: number) {
  if (!crossBaseGeometry) {
    const g1 = new THREE.PlaneGeometry(bladeWidth * 2, bladeHeight * 0.5, 1, 1);
    const g2 = new THREE.PlaneGeometry(bladeWidth * 2, bladeHeight * 0.5, 1, 1);
    g1.rotateY(0);
    g2.rotateY(Math.PI / 2);
    const cross = new THREE.BufferGeometry();
    const pos1 = g1.attributes.position.array as Float32Array;
    const pos2 = g2.attributes.position.array as Float32Array;
    const uv1 = g1.attributes.uv.array as Float32Array;
    const uv2 = g2.attributes.uv.array as Float32Array;
    const norm1 = g1.attributes.normal.array as Float32Array;
    const norm2 = g2.attributes.normal.array as Float32Array;
    const positions = new Float32Array(pos1.length + pos2.length);
    positions.set(pos1, 0);
    positions.set(pos2, pos1.length);
    const uvs = new Float32Array(uv1.length + uv2.length);
    uvs.set(uv1, 0);
    uvs.set(uv2, uv1.length);
    const normals = new Float32Array(norm1.length + norm2.length);
    normals.set(norm1, 0);
    normals.set(norm2, norm1.length);
    cross.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    cross.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    cross.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    const indicesPerPlane = [0, 1, 2, 0, 2, 3];
    const indexArray = new Uint16Array(indicesPerPlane.length * 2);
    for (let index = 0; index < indicesPerPlane.length; index += 1)
      indexArray[index] = indicesPerPlane[index];
    for (let index = 0; index < indicesPerPlane.length; index += 1)
      indexArray[indicesPerPlane.length + index] = indicesPerPlane[index] + 4;
    cross.setIndex(new THREE.BufferAttribute(indexArray, 1));
    crossBaseGeometry = cross;
  }
  return crossBaseGeometry;
}

export function ensureSharedResources(bladeWidth: number, bladeHeight: number) {
  if (!sharedGrassTexture) {
    const loader = new THREE.TextureLoader();
    loader.crossOrigin = '';
    const grassTex = loader.load('/src/assets/models/grass/blade_diffuse.jpg');
    grassTex.minFilter = THREE.LinearMipmapLinearFilter;
    grassTex.magFilter = THREE.LinearFilter;
    grassTex.anisotropy = 1;
    sharedGrassTexture = grassTex;
  }
  if (!sharedAlphaMap) {
    const loader = new THREE.TextureLoader();
    loader.crossOrigin = '';
    const alphaTex = loader.load('/src/assets/models/grass/blade_alpha.jpg');
    alphaTex.minFilter = THREE.LinearMipmapLinearFilter;
    alphaTex.magFilter = THREE.LinearFilter;
    alphaTex.anisotropy = 1;
    alphaTex.generateMipmaps = true;
    sharedAlphaMap = alphaTex;
  }
  if (!baseGeometry) {
    baseGeometry = new THREE.PlaneGeometry(bladeWidth, bladeHeight, 1, 1);
    baseGeometry.translate(0, bladeHeight / 2, 0);
    const vertex = new THREE.Vector3();
    const quaternion0 = new THREE.Quaternion();
    const quaternion1 = new THREE.Quaternion();
    let angle = 0.05;
    quaternion0.setFromAxisAngle(new THREE.Vector3(0, 1, 0), angle);
    angle = 0.3;
    quaternion1.setFromAxisAngle(new THREE.Vector3(1, 0, 0), angle);
    quaternion0.multiply(quaternion1);
    angle = 0.1;
    quaternion1.setFromAxisAngle(new THREE.Vector3(0, 0, 1), angle);
    quaternion0.multiply(quaternion1);
    const quaternion2 = new THREE.Quaternion();
    for (
      let posIndex = 0;
      posIndex < baseGeometry.attributes.position.array.length;
      posIndex += 3
    ) {
      quaternion2.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
      vertex.x = baseGeometry.attributes.position.array[posIndex];
      vertex.y = baseGeometry.attributes.position.array[posIndex + 1];
      vertex.z = baseGeometry.attributes.position.array[posIndex + 2];
      const frac = vertex.y / bladeHeight;
      quaternion2.slerp(quaternion0, frac);
      vertex.applyQuaternion(quaternion2);
      baseGeometry.attributes.position.array[posIndex] = vertex.x;
      baseGeometry.attributes.position.array[posIndex + 1] = vertex.y;
      baseGeometry.attributes.position.array[posIndex + 2] = vertex.z;
    }
    baseGeometry.computeVertexNormals();
  }
}

export function createInstancedGeometry(options: {
  centerX: number;
  centerZ: number;
  width: number;
  sampleHeight: (x: number, z: number) => number;
  waterLevel: number;
  bladeCount: number;
  bladeWidth: number;
  bladeHeight: number;
}) {
  const {
    centerX,
    centerZ,
    width,
    sampleHeight,
    waterLevel,
    bladeCount,
    bladeWidth,
    bladeHeight,
  } = options;

  const instances = Math.max(0, bladeCount);

  const instancedGeometry = new THREE.InstancedBufferGeometry();
  const baseGeom = baseGeometry;
  if (!baseGeom) throw new Error('Missing base geometry');
  instancedGeometry.index = baseGeom.index;
  instancedGeometry.attributes.position = baseGeom.attributes.position;
  instancedGeometry.attributes.uv = baseGeom.attributes.uv;
  instancedGeometry.attributes.normal = baseGeom.attributes.normal;

  const indices = new Float32Array(instances);
  const offsets = new Float32Array(instances * 3);
  const scales = new Float32Array(instances);
  const halfRootAngles = new Float32Array(instances * 2);

  const placedCount = populateInstanceAttributes({
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
  });

  instancedGeometry.setAttribute(
    'offset',
    new THREE.InstancedBufferAttribute(offsets.subarray(0, placedCount * 3), 3),
  );
  instancedGeometry.setAttribute(
    'scale',
    new THREE.InstancedBufferAttribute(scales.subarray(0, placedCount), 1),
  );
  instancedGeometry.setAttribute(
    'halfRootAngle',
    new THREE.InstancedBufferAttribute(
      halfRootAngles.subarray(0, placedCount * 2),
      2,
    ),
  );
  instancedGeometry.setAttribute(
    'index',
    new THREE.InstancedBufferAttribute(indices, 1),
  );
  instancedGeometry.instanceCount = placedCount;

  if (placedCount > 0) {
    computeBoundingSphere(instancedGeometry, {
      width,
      bladeWidth,
      bladeHeight,
      centerX,
      centerZ,
      sampleHeight,
    });
  }

  return { instancedGeometry, placedCount };
}

export function ensureSharedMaterial(width: number) {
  let matLocal = sharedMaterial;
  if (!matLocal) {
    matLocal = new THREE.RawShaderMaterial({
      alphaTest: 0.5,
      fragmentShader: grassFragmentSource,
      side: THREE.DoubleSide,
      transparent: true,
      uniforms: {
        alphaMap: { value: sharedAlphaMap },
        ambientStrength: { value: 0.5 },
        cameraPosition: { value: new THREE.Vector3(0, 0, 0) },
        diffuseStrength: { value: 1.1 },
        lightColour: { value: new THREE.Vector3(1, 1, 1) },
        map: { value: sharedGrassTexture },
        shininess: { value: 64 },
        specularColour: { value: new THREE.Vector3(1, 1, 1) },
        specularStrength: { value: 0.2 },
        sunDirection: { value: new THREE.Vector3(0.5, 0.5, 0.2) },
        time: { value: 0 },
        translucencyStrength: { value: 0.6 },
        width: { value: width },
      },
      vertexShader: grassVertexSource,
    });
    sharedMaterial = matLocal;
  }

  return matLocal;
}

export function getSharedMaterial() {
  return sharedMaterial;
}
