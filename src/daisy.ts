import * as THREE from 'three';
import { Flower } from './flower';
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader';

const MODEL_PATH = '/src/models/daisy/';
const MTL_FILE = '10441_Daisy_v1_max2010_iteration-2.mtl';
const OBJ_FILE = '10441_Daisy_v1_max2010_iteration-2.obj';
const MODEL_SCALE = 0.2;

let daisyModelPromise: Promise<THREE.Group> | null = null;

function noopProgress(): void {
  /* Empty */
}

async function loadDaisyModel(): Promise<THREE.Group> {
  if (daisyModelPromise) return daisyModelPromise;

  daisyModelPromise = new Promise<THREE.Group>((resolve, reject) => {
    const mtlLoader = new MTLLoader();
    mtlLoader.setPath(MODEL_PATH);
    mtlLoader.load(
      MTL_FILE,
      (materials) => {
        materials.preload();
        const objectLoader = new OBJLoader();
        objectLoader.setMaterials(materials);
        objectLoader.setPath(MODEL_PATH);
        objectLoader.load(
          OBJ_FILE,
          (object) => {
            resolve(object);
          },
          noopProgress,
          (error) => {
            reject(new Error(String(error)));
          },
        );
      },
      noopProgress,
      (error) => {
        reject(new Error(String(error)));
      },
    );
  });

  return daisyModelPromise;
}

function instantiateWithSharedResources(
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
    group.add(instantiateWithSharedResources(child));
  return group;
}

export class Daisy extends Flower {
  constructor(scale = 1) {
    super();
    this.init(scale).catch(console.error);
  }

  private async init(scale: number): Promise<void> {
    const model = await loadDaisyModel();
    const instance = instantiateWithSharedResources(model);
    // OBJ/MTL model uses a different up axis — rotate so Y is up in the scene
    instance.rotateX(-Math.PI / 2);
    // Apply global model scale to reduce imported model size
    instance.scale.multiplyScalar(MODEL_SCALE);
    // Create LOD: close = full model (shared), mid = simple disk, far = empty
    const lod = new THREE.LOD();
    // High detail (shared resources)
    lod.addLevel(instance, 0);

    // Far level: empty object to effectively hide the flower beyond this
    lod.addLevel(new THREE.Object3D(), 160);

    // Keep the original group reference so callers who added the group to the scene retain a valid object. Attach the LOD as a child instead.
    this.group.add(lod);
    this.group.rotation.y = Math.random() * Math.PI * 2;
    const scaleVariable = 0.8 + Math.random() * 0.6;
    this.group.scale.set(
      scaleVariable * scale,
      scaleVariable * scale,
      scaleVariable * scale,
    );
  }
}
