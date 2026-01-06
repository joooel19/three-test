import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky';

export class SkyController extends THREE.Group {
  private sky: Sky;
  private sun: THREE.Vector3;
  private sunLight: THREE.DirectionalLight;
  private ambient: THREE.AmbientLight;
  private readonly azimuth: number = 180;
  private readonly elevation: number = 135;

  constructor() {
    super();
    this.sky = new Sky();
    this.sky.scale.setScalar(450_000);
    this.add(this.sky);

    this.sun = new THREE.Vector3();

    const { uniforms } = this.sky.material;
    uniforms.turbidity.value = 10;
    uniforms.rayleigh.value = 3;
    uniforms.mieCoefficient.value = 0.005;
    uniforms.mieDirectionalG.value = 0.7;

    const phi = THREE.MathUtils.degToRad(90 - this.elevation);
    const theta = THREE.MathUtils.degToRad(this.azimuth);

    this.sun.setFromSphericalCoords(1, phi, theta);
    uniforms.sunPosition.value.copy(this.sun);

    this.ambient = new THREE.AmbientLight('#ffffff', 0.5);
    this.add(this.ambient);

    this.sunLight = new THREE.DirectionalLight('#ffffff', 1);
    this.sunLight.position.copy(this.sun).multiplyScalar(450_000);
    this.sunLight.castShadow = true;
    this.add(this.sunLight);
    this.add(this.sunLight.target);
  }
}
