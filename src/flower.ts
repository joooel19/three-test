import * as THREE from 'three';

export abstract class Flower {
  public group: THREE.Object3D;
  constructor() {
    this.group = new THREE.Group();
  }

  getObject3D(): THREE.Object3D {
    return this.group;
  }

  dispose(): void {
    this.group.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      // Skip disposing shared resources (prototypes cloned with sharedModel)
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
}
