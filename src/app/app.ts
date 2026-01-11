import * as THREE from 'three';
import Stats from 'three/addons/libs/stats.module.js';
import { createComposer } from './postprocessing';
import { Player } from './player';
import { SkyController } from './sky/sky';
import { Terrain } from './terrain/terrain';
import { createRenderer } from './renderer';

export function startApp(container: HTMLDivElement): void {
  const stats = new Stats();
  container.append(stats.dom);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2('#e0e0e0', 0.0025);

  const camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    4096,
  );

  const renderer = createRenderer(container, camera);

  const composer = createComposer(renderer, scene, camera);

  // Sky, lighting and shadows
  const skyController = new SkyController();
  scene.add(skyController);

  // Terrain
  const terrain = new Terrain(skyController);
  scene.add(terrain);

  // Player (pointer-lock + movement)
  const blocker = document.getElementById('blocker');
  const instructions = document.getElementById('instructions');

  const player = new Player(camera, document.body, {
    gravity: 9.81,
    ground: terrain.getHeightAt.bind(terrain),
    height: 1.8,
    jumpVelocity: 2,
    speed: 200,
  });
  // Place player above terrain at start
  player.object.position.set(0, terrain.getHeightAt(0, 0) + 1.8, 0);
  player.enablePointerLockUI(blocker, instructions);
  scene.add(player.object);

  const clock = new THREE.Clock();

  renderer.setAnimationLoop(() => {
    const delta = clock.getDelta();
    skyController.update(camera, delta);
    player.update(delta);
    terrain.updatePlayerPosition(player.object.position);
    terrain.update(camera, delta);
    composer.render();
    stats.update();
  });
}
