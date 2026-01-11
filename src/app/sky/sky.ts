import * as Cloud from './cloud';
import * as THREE from 'three';
import {
  Lensflare,
  LensflareElement,
} from 'three/examples/jsm/objects/Lensflare';
import { Sky } from 'three/examples/jsm/objects/Sky';
import { Water } from 'three/examples/jsm/objects/Water';

export class SkyController extends THREE.Group {
  public sun: THREE.Vector3;
  private sky!: Sky;
  private sunLight!: THREE.DirectionalLight;
  private ambient!: THREE.AmbientLight;
  private lensflareLight!: THREE.PointLight;
  private clouds: Cloud.CloudVolume[] = [];
  private cloudOffsets: THREE.Vector3[] = [];
  private water!: Water;

  private waterLevel = 16;

  private readonly azimuth: number = 180;
  private readonly elevation: number = 140;
  private readonly color: string = '#ffffff';

  private static rand(min: number, max: number) {
    return Math.random() * (max - min) + min;
  }

  constructor() {
    super();
    this.sun = new THREE.Vector3();
    this.initSky();
    this.initLights();
    this.initLensflare();
    this.createClouds();
    this.initWater();
  }

  private initSky(): void {
    this.sky = new Sky();
    this.sky.scale.setScalar(450_000);
    this.add(this.sky);

    const { uniforms } = this.sky.material;
    uniforms.turbidity.value = 10;
    uniforms.rayleigh.value = 1;
    uniforms.mieCoefficient.value = 0.005;
    uniforms.mieDirectionalG.value = 0.8;

    const phi = THREE.MathUtils.degToRad(90 - this.elevation);
    const theta = THREE.MathUtils.degToRad(this.azimuth);

    this.sun.setFromSphericalCoords(1, phi, theta);
    uniforms.sunPosition.value.copy(this.sun);
  }

  private initLights(): void {
    this.ambient = new THREE.AmbientLight(this.color, 2);
    this.add(this.ambient);

    this.sunLight = new THREE.DirectionalLight(this.color, 10);
    this.sunLight.position.copy(this.sun).multiplyScalar(450_000);
    this.sunLight.castShadow = true;
    this.add(this.sunLight);
    this.add(this.sunLight.target);

    const flareColor = new THREE.Color(this.color);
    const point = new THREE.PointLight(flareColor, 1.5, 0, 2);
    point.position.copy(this.sunLight.position);
    this.lensflareLight = point;
    this.add(point);
  }

  private initLensflare(): void {
    const makeTexture = (
      size: number,
      inner = '#ffffff',
      outer = 'rgba(255,255,255,0)',
    ) => {
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const context = canvas.getContext('2d');
      if (!context) {
        const fallbackTex = new THREE.CanvasTexture(canvas);
        fallbackTex.needsUpdate = true;
        return fallbackTex;
      }
      const gradient = context.createRadialGradient(
        size / 2,
        size / 2,
        0,
        size / 2,
        size / 2,
        size / 2,
      );
      gradient.addColorStop(0, inner);
      gradient.addColorStop(0.2, inner);
      gradient.addColorStop(1, outer);
      context.fillStyle = gradient;
      context.fillRect(0, 0, size, size);
      const tex = new THREE.CanvasTexture(canvas);
      tex.needsUpdate = true;
      return tex;
    };

    const tex0 = makeTexture(1024, '#ffffff', 'rgba(255,255,255,0)');
    const tex3 = makeTexture(
      256,
      'rgba(255,255,255,0.6)',
      'rgba(255,255,255,0)',
    );
    const flareColor = new THREE.Color(this.color);
    const lensflare = new Lensflare();
    lensflare.addElement(new LensflareElement(tex0, 1400, 0, flareColor));
    lensflare.addElement(new LensflareElement(tex3, 120, 0.4));
    lensflare.addElement(new LensflareElement(tex3, 140, 0.6));
    lensflare.addElement(new LensflareElement(tex3, 220, 0.85));
    lensflare.addElement(new LensflareElement(tex3, 130, 1));
    this.lensflareLight.add(lensflare);
  }

  private createClouds(): void {
    const cloudCount = 12;
    for (let index = 0; index < cloudCount; index += 1) {
      const ox = SkyController.rand(-2000, 2000);
      const oz = SkyController.rand(-2000, 2000);
      const oy = SkyController.rand(320, 460);
      const cloud = new Cloud.CloudVolume(new THREE.Vector3(ox, oy, oz));
      this.clouds.push(cloud);
      this.cloudOffsets.push(new THREE.Vector3(ox, oy, oz));
      this.add(cloud);
    }
  }

  private initWater(): void {
    const loader = new THREE.TextureLoader();
    const waterNormals = loader.load(
      '/src/assets/models/water/waternormals.jpg',
    );
    waterNormals.wrapS = THREE.RepeatWrapping;
    waterNormals.wrapT = THREE.RepeatWrapping;

    const waterGeom = new THREE.CircleGeometry(1024, 64);
    const water = new Water(waterGeom, {
      distortionScale: 3.7,
      fog: false,
      sunColor: new THREE.Color('white'),
      sunDirection: new THREE.Vector3(),
      textureHeight: 256,
      textureWidth: 256,
      waterColor: new THREE.Color('#001e0f'),
      waterNormals,
    });
    water.rotation.x = -Math.PI / 2;
    water.position.set(0, this.waterLevel, 0);
    water.material.uniforms.size.value = 2;
    water.material.uniforms.sunDirection.value.copy(this.sun).normalize();
    this.water = water;
    this.add(water);
  }

  // Call this every frame to update visibility/intensity based on camera view
  public update(camera: THREE.Camera, delta: number): void {
    // Lens flare
    const camDirection = new THREE.Vector3();
    camera.getWorldDirection(camDirection).normalize();

    // Vector from camera to sun.
    const sunPos = new THREE.Vector3();
    this.lensflareLight.getWorldPosition(sunPos);
    const camPos = new THREE.Vector3();
    camera.getWorldPosition(camPos);
    const toSun = sunPos.sub(camPos).normalize();

    const angle = camDirection.angleTo(toSun);
    const threshold = THREE.MathUtils.degToRad(90);
    const visibilityFactor = Math.max(0, 1 - angle / threshold);

    this.lensflareLight.intensity = THREE.MathUtils.lerp(
      0,
      1.5,
      visibilityFactor ** 0.75,
    );
    this.lensflareLight.visible = visibilityFactor > 0.001;
    // Position clouds relative to player so they effectively follow movement.
    const playerPos = new THREE.Vector3();
    camera.getWorldPosition(playerPos);
    for (let index = 0; index < this.clouds.length; index += 1) {
      const off = this.cloudOffsets[index];
      const cloud = this.clouds[index];
      cloud.position.set(playerPos.x + off.x, off.y, playerPos.z + off.z);
      cloud.update(camera);
    }

    this.water.position.set(playerPos.x, this.waterLevel, playerPos.z);
    const uniforms = this.water.material.uniforms as {
      time: THREE.IUniform<number>;
      sunDirection: THREE.IUniform<THREE.Vector3>;
    };
    uniforms.time.value += delta;
    uniforms.sunDirection.value.copy(this.sun).normalize();
  }
}
