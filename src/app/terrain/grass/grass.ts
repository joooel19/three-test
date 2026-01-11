import * as THREE from 'three';
import type { SkyController } from '../../sky/sky';
import {
  createFarBase,
  createCrossBase,
  ensureSharedResources,
  createInstancedGeometry,
  ensureSharedMaterial,
  getSharedMaterial,
} from './grass-common';

// Port of the provided grass implementation adapted for the project's chunk API.
export class Grass {
  public mesh: THREE.LOD;
  private material: THREE.RawShaderMaterial;
  private width: number;
  // Squared distance beyond which the mesh is fully hidden (no CPU/GPU work)
  private cullDistanceSq: number;
  // Global (shared) time for the grass shader. Updated once per-frame
  private static sharedTime = 0;

  private buildLod(options: {
    instancedGeometry: THREE.InstancedBufferGeometry;
    farBaseGeom: THREE.PlaneGeometry;
    crossBaseGeom: THREE.BufferGeometry;
    placedCount: number;
  }) {
    const { instancedGeometry, farBaseGeom, crossBaseGeom, placedCount } =
      options;
    const lod = new THREE.LOD();
    const nearMesh = new THREE.Mesh(instancedGeometry, this.material);
    nearMesh.castShadow = false;
    nearMesh.receiveShadow = false;
    lod.addLevel(nearMesh, 0);

    const farInst = new THREE.InstancedBufferGeometry();
    if (farBaseGeom.index) farInst.index = farBaseGeom.index;
    farInst.attributes.position = farBaseGeom.attributes.position;
    farInst.attributes.uv = farBaseGeom.attributes.uv;
    farInst.attributes.normal = farBaseGeom.attributes.normal;
    // Reuse the same instanced attributes created for the near geometry. Instead
    // Of allocating new InstancedBufferAttribute views, reference the existing
    // Attributes and bake a lower instance count for the far LOD.
    farInst.setAttribute('offset', instancedGeometry.getAttribute('offset'));
    farInst.setAttribute('scale', instancedGeometry.getAttribute('scale'));
    farInst.setAttribute(
      'halfRootAngle',
      instancedGeometry.getAttribute('halfRootAngle'),
    );
    farInst.setAttribute('index', instancedGeometry.getAttribute('index'));
    const farInstanceCount = Math.max(0, Math.floor(placedCount * 0.6));
    farInst.instanceCount = farInstanceCount;
    if (instancedGeometry.boundingSphere)
      farInst.boundingSphere = instancedGeometry.boundingSphere.clone();
    const farMesh = new THREE.Mesh(farInst, this.material);
    farMesh.castShadow = false;
    farMesh.receiveShadow = false;
    lod.addLevel(farMesh, 160);

    const crossInst = new THREE.InstancedBufferGeometry();
    if (crossBaseGeom.index)
      crossInst.index = crossBaseGeom.index as unknown as THREE.BufferAttribute;
    crossInst.attributes.position = crossBaseGeom.attributes
      .position as THREE.BufferAttribute;
    crossInst.attributes.uv = crossBaseGeom.attributes
      .uv as THREE.BufferAttribute;
    crossInst.attributes.normal = crossBaseGeom.attributes
      .normal as THREE.BufferAttribute;
    // Reuse instanced attributes for cross geometry. Reference the existing
    // Instanced attributes and bake a smaller instance count for the very-far
    // Cross quads.
    crossInst.setAttribute('offset', instancedGeometry.getAttribute('offset'));
    crossInst.setAttribute('scale', instancedGeometry.getAttribute('scale'));
    crossInst.setAttribute(
      'halfRootAngle',
      instancedGeometry.getAttribute('halfRootAngle'),
    );
    crossInst.setAttribute('index', instancedGeometry.getAttribute('index'));
    const crossInstanceCount = Math.max(0, Math.floor(placedCount * 0.25));
    crossInst.instanceCount = crossInstanceCount;
    if (instancedGeometry.boundingSphere)
      crossInst.boundingSphere = instancedGeometry.boundingSphere.clone();
    const crossMesh = new THREE.Mesh(crossInst, this.material);
    crossMesh.castShadow = false;
    crossMesh.receiveShadow = false;
    lod.addLevel(crossMesh, 320);

    return lod;
  }
  private static sharedMaterial: THREE.RawShaderMaterial | null = null;
  private static sharedGrassTexture: THREE.Texture | null = null;
  private static sharedAlphaMap: THREE.Texture | null = null;

  /**
   * Update global uniforms that are shared by the material. Call once per frame.
   */
  public static updateGlobalUniforms(
    delta: number,
    cameraPos: THREE.Vector3,
    skyController: SkyController,
  ) {
    Grass.sharedTime += delta;
    const mat = getSharedMaterial();
    if (!mat) return;
    const uniforms = mat.uniforms as Record<string, { value: unknown }>;
    (uniforms.time.value as number) = Grass.sharedTime;
    (uniforms.cameraPosition.value as THREE.Vector3).copy(cameraPos);
    (uniforms.sunDirection.value as THREE.Vector3)
      .copy(skyController.sun)
      .normalize();
  }

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

    this.width = width;

    const bladeWidth = 0.12;
    const bladeHeight = 1;

    ensureSharedResources(bladeWidth, bladeHeight);

    const { instancedGeometry, placedCount } = createInstancedGeometry({
      bladeCount,
      bladeHeight,
      bladeWidth,
      centerX,
      centerZ,
      sampleHeight,
      waterLevel,
      width,
    });

    const farBaseGeom = createFarBase(bladeWidth, bladeHeight);
    const crossBaseGeom = createCrossBase(bladeWidth, bladeHeight);

    this.material = ensureSharedMaterial(width);

    this.mesh = this.buildLod({
      crossBaseGeom,
      farBaseGeom,
      instancedGeometry,
      placedCount,
    });
    this.mesh.position.set(centerX, 0, centerZ);
    this.mesh.frustumCulled = true;

    this.cullDistanceSq = 400 * 400;

    this.mesh.onBeforeRender = () => {
      const uniforms = this.material.uniforms as Record<
        string,
        { value: unknown }
      >;
      (uniforms.width.value as number) = this.width;
    };
  }

  // Helpers moved to grass.shared.ts

  public update(cameraPos: THREE.Vector3) {
    // Simple LOD based on camera distance. Global uniforms (time, camera
    // Position, sun direction) should be updated once per-frame by calling
    // `Grass.updateGlobalUniforms(delta, cameraPos, skyController)` externally.
    const worldPos = new THREE.Vector3();
    this.mesh.getWorldPosition(worldPos);
    const dx = worldPos.x - cameraPos.x;
    const dz = worldPos.z - cameraPos.z;
    const distance = dx * dx + dz * dz;

    // Distance culling: hide the whole mesh when beyond `cullDistanceSq` to
    // Avoid Three.js processing it in the render loop.
    if (distance > this.cullDistanceSq) {
      this.mesh.visible = false;
      return;
    }

    this.mesh.visible = true;
  }

  public dispose(parent: THREE.Object3D) {
    parent.remove(this.mesh);
    // Dispose only per-chunk geometry. Shared material and textures are kept alive.
    for (let ci = this.mesh.children.length - 1; ci >= 0; ci--) {
      const child = this.mesh.children[ci] as THREE.Mesh;
      child.geometry.dispose();
      this.mesh.remove(child);
    }
  }
}
