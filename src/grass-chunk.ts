import * as THREE from 'three';
import type { SkyController } from './sky';

// Port of the provided grass implementation adapted for the project's chunk API.
export class GrassChunk {
  public mesh: THREE.Mesh;
  private material: THREE.RawShaderMaterial;
  private geometry: THREE.InstancedBufferGeometry;
  private placed = 0;
  private time = 0;

  constructor(options: {
    centerX: number;
    centerZ: number;
    width: number;
    sampleHeight: (x: number, z: number) => number;
    waterLevel: number;
    bladeCount: number;
  }) {
    const { centerX, centerZ, width, sampleHeight, waterLevel, bladeCount } =
      options;

    const joints = 4;
    const bladeWidth = 0.12;
    const bladeHeight = 1;

    const instances = Math.max(0, bladeCount || 40_000);

    // Textures (using external images from the source example)
    const loader = new THREE.TextureLoader();
    loader.crossOrigin = '';
    const grassTexture = loader.load(
      new URL('textures/grass/blade_diffuse.jpg', import.meta.url).href,
    );
    const alphaMap = loader.load(
      new URL('textures/grass/blade_alpha.jpg', import.meta.url).href,
    );
    const noiseTexture = loader.load(
      new URL('textures/grass/perlinFbm.jpg', import.meta.url).href,
    );
    noiseTexture.wrapS = THREE.RepeatWrapping;
    noiseTexture.wrapT = THREE.RepeatWrapping;

    // Base blade geometry
    const grassBaseGeometry = new THREE.PlaneGeometry(
      bladeWidth,
      bladeHeight,
      1,
      joints,
    );
    grassBaseGeometry.translate(0, bladeHeight / 2, 0);

    // Bend blade for organic look
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
      posIndex < grassBaseGeometry.attributes.position.array.length;
      posIndex += 3
    ) {
      quaternion2.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
      vertex.x = grassBaseGeometry.attributes.position.array[posIndex];
      vertex.y = grassBaseGeometry.attributes.position.array[posIndex + 1];
      vertex.z = grassBaseGeometry.attributes.position.array[posIndex + 2];
      const frac = vertex.y / bladeHeight;
      quaternion2.slerp(quaternion0, frac);
      vertex.applyQuaternion(quaternion2);
      grassBaseGeometry.attributes.position.array[posIndex] = vertex.x;
      grassBaseGeometry.attributes.position.array[posIndex + 1] = vertex.y;
      grassBaseGeometry.attributes.position.array[posIndex + 2] = vertex.z;
    }

    grassBaseGeometry.computeVertexNormals();

    const instancedGeometry = new THREE.InstancedBufferGeometry();
    instancedGeometry.index = grassBaseGeometry.index;
    instancedGeometry.attributes.position =
      grassBaseGeometry.attributes.position;
    instancedGeometry.attributes.uv = grassBaseGeometry.attributes.uv;
    instancedGeometry.attributes.normal = grassBaseGeometry.attributes.normal;

    // Per-instance attributes
    const indices: number[] = [];
    const offsets: number[] = [];
    const scales: number[] = [];
    const halfRootAngles: number[] = [];

    let placedCount = 0;
    for (let index = 0; index < instances; index++) {
      indices.push(index / instances);
      const x = Math.random() * width - width / 2;
      const z = Math.random() * width - width / 2;
      const y = sampleHeight(centerX + x, centerZ + z);
      // Skip underwater blades
      if (y <= waterLevel + 0.5) {
        // Push a dummy off-screen element to keep arrays aligned
        offsets.push(0, -10_000, 0);
        scales.push(0);
        halfRootAngles.push(0, 1);
        continue;
      }
      offsets.push(x, y, z);
      placedCount++;
      const angleRoot = Math.PI - Math.random() * (2 * Math.PI);
      halfRootAngles.push(Math.sin(0.5 * angleRoot), Math.cos(0.5 * angleRoot));
      if (index % 3 !== 0) scales.push(2 + Math.random() * 1.25);
      else scales.push(2 + Math.random());
    }

    instancedGeometry.setAttribute(
      'offset',
      new THREE.InstancedBufferAttribute(new Float32Array(offsets), 3),
    );
    instancedGeometry.setAttribute(
      'scale',
      new THREE.InstancedBufferAttribute(new Float32Array(scales), 1),
    );
    instancedGeometry.setAttribute(
      'halfRootAngle',
      new THREE.InstancedBufferAttribute(new Float32Array(halfRootAngles), 2),
    );
    instancedGeometry.setAttribute(
      'index',
      new THREE.InstancedBufferAttribute(new Float32Array(indices), 1),
    );

    // Only draw the number of instances actually placed (exclude dummies)
    instancedGeometry.instanceCount = placedCount;
    this.placed = placedCount;

    // Compute conservative bounding sphere from placed offsets so frustum culling works
    if (placedCount > 0) {
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      let minZ = Infinity;
      let maxZ = -Infinity;
      for (let index = 0; index < offsets.length; index += 3) {
        const oy = offsets[index + 1];
        // Dummy
        if (oy <= -9999) continue;
        const ox = offsets[index + 0];
        const oz = offsets[index + 2];
        if (ox < minX) minX = ox;
        if (ox > maxX) maxX = ox;
        if (oy < minY) minY = oy;
        if (oy > maxY) maxY = oy;
        if (oz < minZ) minZ = oz;
        if (oz > maxZ) maxZ = oz;
      }
      const cx = (minX + maxX) * 0.5;
      const cy = (minY + maxY) * 0.5 + bladeHeight * 0.5;
      const cz = (minZ + maxZ) * 0.5;
      const dx = Math.max(Math.abs(minX - cx), Math.abs(maxX - cx));
      const dz = Math.max(Math.abs(minZ - cz), Math.abs(maxZ - cz));
      const dy = Math.max(Math.abs(minY - cy), Math.abs(maxY - cy));
      const radius =
        Math.hypot(dx, dy, dz) + Math.hypot(bladeWidth, bladeHeight);
      instancedGeometry.boundingSphere = new THREE.Sphere(
        new THREE.Vector3(cx, cy, cz),
        radius,
      );
    }

    const grassVertexSource = `
precision mediump float;
attribute vec3 position;
attribute vec3 normal;
attribute vec3 offset;
attribute vec2 uv;
attribute vec2 halfRootAngle;
attribute float scale;
attribute float index;
uniform float time;

uniform float delta;
uniform float posX;
uniform float posZ;
uniform float radius;
uniform float width;

uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;

varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vPosition;
varying float frc;
varying float idx;

const float PI = 3.1415;
const float TWO_PI = 2.0 * PI;

vec3 rotateVectorByQuaternion(vec3 v, vec4 q){
  return 2.0 * cross(q.xyz, v * q.w + cross(q.xyz, v)) + v;
}

float placeOnSphere(vec3 v){
  float theta = acos(v.z/radius);
  float phi = acos(v.x/(radius * sin(theta)));
  float sV = radius * sin(theta) * sin(phi);
  if(sV != sV){
    sV = v.y;
  }
  return sV;
}

void main() {

  frc = position.y / float(1.0);
  vec3 vPosition = position;
  vPosition.y *= scale;
  vNormal = normal;
  vNormal.y /= scale;

  vec4 direction = vec4(0.0, halfRootAngle.x, 0.0, halfRootAngle.y);
  vPosition = rotateVectorByQuaternion(vPosition, direction);
  vNormal = rotateVectorByQuaternion(vNormal, direction);
  vUv = uv;

  // Place blade at instance offset (offset is local XYXZ relative to chunk center)
  vec3 pos;
  pos.x = offset.x;
  pos.z = offset.z;
  pos.y = offset.y;

  vec2 fractionalPos = 0.5 + offset.xz / width;
  fractionalPos *= TWO_PI;
  float noise = 0.5 + 0.5 * sin(fractionalPos.x + time);
  float halfAngle = -noise * 0.1;
  noise = 0.5 + 0.5 * cos(fractionalPos.y + time);
  halfAngle -= noise * 0.05;
  direction = normalize(vec4(sin(halfAngle), 0.0, -sin(halfAngle), cos(halfAngle)));
  vPosition = rotateVectorByQuaternion(vPosition, direction);
  vNormal = rotateVectorByQuaternion(vNormal, direction);
  vPosition += pos;
  idx = index;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(vPosition, 1.0);
}
`;

    const grassFragmentSource = `
precision mediump float;
uniform vec3 cameraPosition;
uniform float ambientStrength;
uniform float diffuseStrength;
uniform float specularStrength;
uniform float translucencyStrength;
uniform float shininess;
uniform vec3 lightColour;
uniform vec3 sunDirection;
uniform sampler2D map;
uniform sampler2D alphaMap;
uniform vec3 specularColour;
varying float frc;
varying float idx;
varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vPosition;
vec3 ACESFilm(vec3 x){
  float a = 2.51;
  float b = 0.03;
  float c = 2.43;
  float d = 0.59;
  float e = 0.14;
  return clamp((x*(a*x+b))/(x*(c*x+d)+e), 0.0, 1.0);
}
void main(){
  if(texture2D(alphaMap, vUv).r < 0.15) discard;
  vec3 normal;
  if(gl_FrontFacing) normal = normalize(vNormal); else normal = normalize(-vNormal);
  vec3 textureColour = pow(texture2D(map, vUv).rgb, vec3(2.2));
  vec3 mixColour = idx > 0.75 ? vec3(0.2,0.8,0.06) : vec3(0.5,0.8,0.08);
  textureColour = mix(0.1 * mixColour, textureColour, 0.75);
  vec3 lightTimesTexture = lightColour * textureColour;
  vec3 ambient = textureColour;
  vec3 lightDir = normalize(sunDirection);
  float dotNormalLight = dot(normal, lightDir);
  float diff = max(dotNormalLight, 0.0);
  vec3 diffuse = diff * lightTimesTexture;
  float sky = max(dot(normal, vec3(0,1,0)), 0.0);
  vec3 skyLight = sky * vec3(0.12, 0.29, 0.55);
  vec3 viewDirection = normalize(cameraPosition - vPosition);
  vec3 halfwayDir = normalize(lightDir + viewDirection);
  float spec = pow(max(dot(normal, halfwayDir), 0.0), shininess);
  vec3 specular = spec * specularColour * lightColour;
  vec3 diffuseTranslucency = vec3(0);
  vec3 forwardTranslucency = vec3(0);
  float dotViewLight = dot(-lightDir, viewDirection);
  if(dotNormalLight <= 0.0){
    diffuseTranslucency = lightTimesTexture * translucencyStrength * -dotNormalLight;
    if(dotViewLight > 0.0) forwardTranslucency = lightTimesTexture * translucencyStrength * pow(dotViewLight, 16.0);
  }
  vec3 col = 0.3 * skyLight * textureColour + ambientStrength * ambient + diffuseStrength * diffuse + specularStrength * specular + diffuseTranslucency + forwardTranslucency;
  col = mix(0.35*vec3(0.1,0.25,0.02), col, frc);
  col = ACESFilm(col);
  col = pow(col, vec3(0.4545));
  gl_FragColor = vec4(col, 1.0);
}
`;

    this.material = new THREE.RawShaderMaterial({
      fragmentShader: grassFragmentSource,
      side: THREE.DoubleSide,
      uniforms: {
        alphaMap: { value: alphaMap },
        ambientStrength: { value: 0.7 },
        cameraPosition: { value: new THREE.Vector3(0, 0, 0) },
        delta: { value: 1 },
        diffuseStrength: { value: 1.5 },
        lightColour: { value: new THREE.Vector3(1, 1, 1) },
        map: { value: grassTexture },
        noiseTexture: { value: noiseTexture },
        posX: { value: 0 },
        posZ: { value: 0 },
        radius: { value: 240 },
        shininess: { value: 256 },
        specularColour: { value: new THREE.Vector3(1, 1, 1) },
        specularStrength: { value: 0.5 },
        sunDirection: { value: new THREE.Vector3(0.5, 0.5, 0.2) },
        time: { value: 0 },
        translucencyStrength: { value: 1.5 },
        width: { value: width },
      },
      vertexShader: grassVertexSource,
    });

    this.geometry = instancedGeometry;
    this.mesh = new THREE.Mesh(instancedGeometry, this.material);
    this.mesh.position.set(centerX, 0, centerZ);
    this.mesh.frustumCulled = true;
  }

  public update(
    delta: number,
    cameraPos: THREE.Vector3,
    skyController: SkyController,
  ) {
    this.time += delta;
    (this.material.uniforms.time as { value: number }).value = this.time;
    (
      this.material.uniforms.cameraPosition as { value: THREE.Vector3 }
    ).value.copy(cameraPos);
    (this.material.uniforms.posX as { value: number }).value = cameraPos.x;
    (this.material.uniforms.posZ as { value: number }).value = cameraPos.z;
    (this.material.uniforms.sunDirection as { value: THREE.Vector3 }).value
      .copy(skyController.sun)
      .normalize();

    // Simple LOD based on camera distance
    const worldPos = new THREE.Vector3();
    this.mesh.getWorldPosition(worldPos);
    const distance = worldPos.distanceTo(cameraPos);
    let density = 1;
    if (distance > 350) density = 0;
    else if (distance > 200) density = 0.15;
    else if (distance > 80) density = 0.5;
    const total =
      (this.geometry.attributes.index as THREE.BufferAttribute).count || 0;
    const desired = Math.max(0, Math.floor(total * density));
    this.geometry.instanceCount = desired;
  }

  public dispose(parent: THREE.Object3D) {
    parent.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
