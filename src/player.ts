import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls';

export type PlayerOptions = {
  speed: number;
  gravity: number;
  jumpVelocity: number;
  height: number;
};

export class Player {
  public controls: PointerLockControls;
  public object: THREE.Object3D;
  private velocity: THREE.Vector3;
  private direction: THREE.Vector3;
  private moveForward = false;
  private moveBackward = false;
  private moveLeft = false;
  private moveRight = false;
  private canJump = false;
  public readonly speed: number;
  public readonly gravity: number;
  public readonly jumpVelocity: number;
  public readonly height: number;

  constructor(
    camera: THREE.Camera,
    domElement: HTMLElement,
    options: PlayerOptions,
  ) {
    this.speed = options.speed;
    this.gravity = options.gravity * 10;
    this.jumpVelocity = options.jumpVelocity * 10;
    this.height = options.height;

    this.controls = new PointerLockControls(camera, domElement);
    this.object = this.controls.object;

    this.velocity = new THREE.Vector3();
    this.direction = new THREE.Vector3();

    this.bindKeys();
  }

  enablePointerLockUI(
    blocker: HTMLElement | null,
    instructions: HTMLElement | null,
  ): void {
    if (instructions)
      instructions.addEventListener('click', () => {
        this.controls.lock();
      });

    this.controls.addEventListener('lock', () => {
      if (blocker) blocker.style.display = 'none';
    });

    this.controls.addEventListener('unlock', () => {
      if (blocker) blocker.style.display = 'flex';
    });
  }

  private bindKeys(): void {
    document.addEventListener('keydown', this.onKeyDown);
    document.addEventListener('keyup', this.onKeyUp);
  }

  private onKeyDown = (event: KeyboardEvent): void => {
    switch (event.code) {
      case 'ArrowUp':
      case 'KeyW':
        this.moveForward = true;
        break;
      case 'ArrowLeft':
      case 'KeyA':
        this.moveLeft = true;
        break;
      case 'ArrowDown':
      case 'KeyS':
        this.moveBackward = true;
        break;
      case 'ArrowRight':
      case 'KeyD':
        this.moveRight = true;
        break;
      case 'Space':
        if (this.canJump) {
          this.velocity.y += this.jumpVelocity;
          this.canJump = false;
        }
        break;
      default:
        break;
    }
  };

  private onKeyUp = (event: KeyboardEvent): void => {
    switch (event.code) {
      case 'ArrowUp':
      case 'KeyW':
        this.moveForward = false;
        break;
      case 'ArrowLeft':
      case 'KeyA':
        this.moveLeft = false;
        break;
      case 'ArrowDown':
      case 'KeyS':
        this.moveBackward = false;
        break;
      case 'ArrowRight':
      case 'KeyD':
        this.moveRight = false;
        break;
      default:
        break;
    }
  };

  update(delta: number): void {
    // Damping
    this.velocity.x -= this.velocity.x * 10 * delta;
    this.velocity.z -= this.velocity.z * 10 * delta;
    // Gravity
    this.velocity.y -= this.gravity * delta;

    this.direction.z = Number(this.moveForward) - Number(this.moveBackward);
    this.direction.x = Number(this.moveRight) - Number(this.moveLeft);
    this.direction.normalize();

    if (this.moveForward || this.moveBackward)
      this.velocity.z -= this.direction.z * this.speed * delta;
    if (this.moveLeft || this.moveRight)
      this.velocity.x -= this.direction.x * this.speed * delta;

    // Move controls
    this.controls.moveRight(-this.velocity.x * delta);
    this.controls.moveForward(-this.velocity.z * delta);

    // Apply vertical motion
    this.object.position.y += this.velocity.y * delta;

    if (this.object.position.y < this.height) {
      this.velocity.y = 0;
      this.object.position.y = this.height;
      this.canJump = true;
    }
  }
}

export default Player;
