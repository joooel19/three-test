import * as THREE from 'three';
import { SkyController } from './sky';
import { Water } from 'three/examples/jsm/objects/Water';

export class WaterFactory {
  private sharedWaterGeometry?: THREE.PlaneGeometry;
  private waterNormals: THREE.Texture;
  private skyController: SkyController;

  constructor(waterNormals: THREE.Texture, skyController: SkyController) {
    this.waterNormals = waterNormals;
    this.skyController = skyController;
  }

  create(
    width: number,
    depth: number,
    centerX: number,
    centerZ: number,
    waterLevel: number,
  ) {
    if (!this.sharedWaterGeometry)
      this.sharedWaterGeometry = new THREE.PlaneGeometry(width, depth);

    const water = new Water(this.sharedWaterGeometry, {
      distortionScale: 3.7,
      fog: false,
      sunColor: new THREE.Color('white'),
      sunDirection: new THREE.Vector3(),
      textureHeight: 512,
      textureWidth: 512,
      waterColor: new THREE.Color('#001e0f'),
      waterNormals: this.waterNormals,
    });
    water.rotation.x = -Math.PI / 2;
    water.position.set(centerX, waterLevel, centerZ);
    water.material.uniforms.size.value = 2;
    water.material.uniforms.sunDirection.value
      .copy(this.skyController.sun)
      .normalize();
    return water;
  }
}
