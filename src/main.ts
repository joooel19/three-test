import * as THREE from 'three';
import { Player } from './player';
import { SkyController } from './sky';

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
scene.add(ground);

// Sky, lighting and shadows
const skyController = new SkyController();
scene.add(skyController);

// Grid helper
const grid = new THREE.GridHelper(1000, 1000, '#888888', '#444444');
scene.add(grid);

// Player (pointer-lock + movement)
const blocker = document.getElementById('blocker');
const instructions = document.getElementById('instructions');

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
