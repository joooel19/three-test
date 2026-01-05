import * as THREE from 'three';
import { Player } from './player';
import { Sky } from 'three/examples/jsm/objects/Sky';

const container = document.getElementById('app') as HTMLDivElement;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  1000,
);
camera.position.set(0, 1.6, 3);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.5;
container.append(renderer.domElement);

const geometry = new THREE.BoxGeometry(1, 1, 1);
const material = new THREE.MeshNormalMaterial();
const cube = new THREE.Mesh(geometry, material);
cube.position.set(0, 2, 0);
scene.add(cube);

// Ground plane
const planeGeo = new THREE.PlaneGeometry(1000, 1000);
const planeMat = new THREE.MeshPhongMaterial({ color: '#808080' });
const ground = new THREE.Mesh(planeGeo, planeMat);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// Sky shader (from three.js example)
const sky = new Sky();
sky.scale.setScalar(450_000);
scene.add(sky);

const sun = new THREE.Vector3();

const effectController = {
  azimuth: 180,
  elevation: 135,
  mieCoefficient: 0.005,
  mieDirectionalG: 0.7,
  rayleigh: 3,
  turbidity: 10,
};

const { uniforms } = sky.material;
uniforms.turbidity.value = effectController.turbidity;
uniforms.rayleigh.value = effectController.rayleigh;
uniforms.mieCoefficient.value = effectController.mieCoefficient;
uniforms.mieDirectionalG.value = effectController.mieDirectionalG;

const phi = THREE.MathUtils.degToRad(90 - effectController.elevation);
const theta = THREE.MathUtils.degToRad(effectController.azimuth);

sun.setFromSphericalCoords(1, phi, theta);
uniforms.sunPosition.value.copy(sun);

// Ambient filling
const ambient = new THREE.AmbientLight('#ffffff', 0.5);
scene.add(ambient);

// Directional "sun" light synced with Sky
const sunLight = new THREE.DirectionalLight('#ffffff', 1);
sunLight.position.copy(sun).multiplyScalar(450_000);
sunLight.castShadow = true;
scene.add(sunLight);
scene.add(sunLight.target);

// Let objects cast shadows from the sun
cube.castShadow = true;

// Grid helper
const grid = new THREE.GridHelper(1000, 1000, '#888888', '#444444');
scene.add(grid);

// Player (pointer-lock + movement)
const blocker = document.getElementById('blocker') as HTMLDivElement | null;
const instructions = document.getElementById(
  'instructions',
) as HTMLDivElement | null;

const player = new Player(camera, document.body, {
  gravity: 9.81,
  height: 1.8,
  jumpVelocity: 2,
  speed: 200,
});
player.enablePointerLockUI(blocker, instructions);
scene.add(player.object);

const clock = new THREE.Clock();

function onWindowResize(): void {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', onWindowResize, false);
renderer.setAnimationLoop(() => {
  const delta = clock.getDelta();
  cube.rotation.x += 0.01;
  cube.rotation.y += 0.013;
  player.update(delta);
  renderer.render(scene, camera);
});
