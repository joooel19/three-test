import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls';

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
container.append(renderer.domElement);

const geometry = new THREE.BoxGeometry(1, 1, 1);
const material = new THREE.MeshNormalMaterial();
const cube = new THREE.Mesh(geometry, material);
scene.add(cube);

// Ground plane
const planeGeo = new THREE.PlaneGeometry(1000, 1000);
const planeMat = new THREE.MeshPhongMaterial({ color: '#808080' });
const ground = new THREE.Mesh(planeGeo, planeMat);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// Lights
const hemi = new THREE.HemisphereLight('#ffffff', '#444444', 1);
hemi.position.set(0, 200, 0);
scene.add(hemi);
const directionalLight = new THREE.DirectionalLight('#ffffff', 0.8);
directionalLight.position.set(5, 10, 7.5);
scene.add(directionalLight);

// Grid helper
const grid = new THREE.GridHelper(1000, 1000, '#888888', '#444444');
scene.add(grid);

// PointerLock controls and movement
const controls = new PointerLockControls(camera, document.body);

const blocker = document.getElementById('blocker') as HTMLDivElement | null;
const instructions = document.getElementById(
  'instructions',
) as HTMLDivElement | null;

if (instructions)
  instructions.addEventListener('click', () => {
    controls.lock();
  });

controls.addEventListener('lock', () => {
  if (blocker) blocker.style.display = 'none';
});

controls.addEventListener('unlock', () => {
  if (blocker) blocker.style.display = 'flex';
});

const playerObject = controls.object as THREE.Object3D;
scene.add(playerObject);

const moveForward = { value: false };
const moveBackward = { value: false };
const moveLeft = { value: false };
const moveRight = { value: false };
let canJump = false;

const velocity = new THREE.Vector3();
const direction = new THREE.Vector3();
const clock = new THREE.Clock();

function onKeyDown(event: KeyboardEvent) {
  switch (event.code) {
    case 'ArrowUp':
    case 'KeyW':
      moveForward.value = true;
      break;
    case 'ArrowLeft':
    case 'KeyA':
      moveLeft.value = true;
      break;
    case 'ArrowDown':
    case 'KeyS':
      moveBackward.value = true;
      break;
    case 'ArrowRight':
    case 'KeyD':
      moveRight.value = true;
      break;
    case 'Space':
      if (canJump) {
        velocity.y += 10;
        canJump = false;
      }
      break;
    default:
      break;
  }
}

function onKeyUp(event: KeyboardEvent) {
  switch (event.code) {
    case 'ArrowUp':
    case 'KeyW':
      moveForward.value = false;
      break;
    case 'ArrowLeft':
    case 'KeyA':
      moveLeft.value = false;
      break;
    case 'ArrowDown':
    case 'KeyS':
      moveBackward.value = false;
      break;
    case 'ArrowRight':
    case 'KeyD':
      moveRight.value = false;
      break;
    default:
      break;
  }
}

document.addEventListener('keydown', onKeyDown);
document.addEventListener('keyup', onKeyUp);

function onWindowResize(): void {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', onWindowResize, false);

function animate(): void {
  requestAnimationFrame(animate);
  cube.rotation.x += 0.01;
  cube.rotation.y += 0.013;
  const delta = clock.getDelta();

  // Update movement
  velocity.x -= velocity.x * 10 * delta;
  velocity.z -= velocity.z * 10 * delta;
  // Simple gravity
  velocity.y -= 9.8 * 10 * delta;

  direction.z = Number(moveForward.value) - Number(moveBackward.value);
  direction.x = Number(moveRight.value) - Number(moveLeft.value);
  direction.normalize();

  if (moveForward.value || moveBackward.value)
    velocity.z -= direction.z * 400 * delta;
  if (moveLeft.value || moveRight.value)
    velocity.x -= direction.x * 400 * delta;

  controls.moveRight(-velocity.x * delta);
  controls.moveForward(-velocity.z * delta);

  playerObject.position.y += velocity.y * delta;

  if (playerObject.position.y < 1.6) {
    velocity.y = 0;
    playerObject.position.y = 1.6;
    canJump = true;
  }

  renderer.render(scene, camera);
}
animate();
