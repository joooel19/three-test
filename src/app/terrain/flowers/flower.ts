import * as THREE from 'three';
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader';

type ModelKey = string;

export abstract class Flower extends THREE.Group {
  private static modelCache: Map<ModelKey, Promise<THREE.Group>> = new Map();

  dispose(): void {
    this.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      const { userData } = child as { userData?: Record<string, unknown> };
      if (userData?.sharedModel === true) return;
      child.geometry.dispose();
      const materialParameter = child.material as
        | THREE.Material
        | THREE.Material[]
        | null
        | undefined;
      if (!materialParameter) return;
      if (Array.isArray(materialParameter))
        for (const matItem of materialParameter) matItem.dispose();
      else materialParameter.dispose();
    });
  }

  private static noopProgress = (): void => {
    /* Empty. */
  };

  protected static async loadOBJModel(
    basePath: string,
    mtlFile: string,
    objectFile: string,
  ): Promise<THREE.Group> {
    const key = `${basePath}|${mtlFile}|${objectFile}`;
    const cached = this.modelCache.get(key);
    if (cached) return cached;

    const promise = new Promise<THREE.Group>((resolve, reject) => {
      const mtlLoader = new MTLLoader();
      mtlLoader.setPath(basePath);
      mtlLoader.load(
        mtlFile,
        (materials) => {
          materials.preload();
          const objectLoader = new OBJLoader();
          objectLoader.setMaterials(materials);
          objectLoader.setPath(basePath);
          objectLoader.load(
            objectFile,
            (object) => {
              resolve(object);
            },
            this.noopProgress,
            (error) => {
              reject(new Error(String(error)));
            },
          );
        },
        this.noopProgress,
        (error) => {
          reject(new Error(String(error)));
        },
      );
    });

    this.modelCache.set(key, promise);
    return promise;
  }

  protected static instantiateWithSharedResources(
    source: THREE.Object3D,
  ): THREE.Object3D {
    if (source instanceof THREE.Mesh) {
      const sourceMesh = source as THREE.Mesh;
      const mesh = new THREE.Mesh(sourceMesh.geometry, sourceMesh.material);
      mesh.name = sourceMesh.name;
      mesh.position.copy(sourceMesh.position);
      mesh.rotation.copy(sourceMesh.rotation);
      mesh.scale.copy(sourceMesh.scale);
      mesh.quaternion.copy(sourceMesh.quaternion);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      (mesh as unknown as { userData: Record<string, unknown> }).userData = {
        sharedModel: true,
      };
      return mesh;
    }

    const group = new THREE.Group();
    group.name = source.name;
    group.position.copy(source.position);
    group.rotation.copy(source.rotation);
    group.scale.copy(source.scale);
    group.quaternion.copy(source.quaternion);
    for (const child of source.children)
      group.add(this.instantiateWithSharedResources(child));
    return group;
  }

  protected async loadAndAttachOBJModel(options: {
    basePath: string;
    externalScale?: number;
    mtlFile: string;
    modelScale: number;
    objectFile: string;
    rotateX?: number;
    lodFar?: number;
  }): Promise<void> {
    const {
      basePath,
      externalScale = 1,
      mtlFile,
      modelScale,
      objectFile,
      rotateX = -Math.PI / 2,
      lodFar = 160,
    } = options;

    const model = await (this.constructor as typeof Flower).loadOBJModel(
      basePath,
      mtlFile,
      objectFile,
    );
    const instance = (
      this.constructor as typeof Flower
    ).instantiateWithSharedResources(model);
    if (rotateX) instance.rotateX(rotateX);
    instance.scale.multiplyScalar(modelScale);

    const lod = new THREE.LOD();
    lod.addLevel(instance, 0);
    lod.addLevel(new THREE.Object3D(), lodFar);

    this.add(lod);
    this.rotation.y = Math.random() * Math.PI * 2;
    const scaleVariable = 0.8 + Math.random() * 0.6;
    this.scale.set(
      scaleVariable * externalScale,
      scaleVariable * externalScale,
      scaleVariable * externalScale,
    );
  }
}
