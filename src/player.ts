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
  public viewModel: THREE.Group;
  private bobTime = 0;
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

    // Create a simple view-model (hands) and attach to the player/camera
    this.viewModel = new THREE.Group();
    const handGeom = new THREE.SphereGeometry(0.18, 16, 12);
    const handMat = new THREE.MeshPhongMaterial({ color: '#ffdbac' });
    const leftHand = new THREE.Mesh(handGeom, handMat);
    const rightHand = new THREE.Mesh(handGeom, handMat);
    leftHand.scale.set(1, 1.3, 0.85);
    rightHand.scale.set(1, 1.3, 0.85);
    leftHand.position.set(-1, -0.6, -0.6);
    rightHand.position.set(1, -0.6, -0.6);
    this.viewModel.add(leftHand, rightHand);
    this.viewModel.position.set(0, -0.2, -0.5);
    this.object.add(this.viewModel);

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

    this.applyViewBobbing(delta);
  }

  applyViewBobbing(delta: number): void {
    // Initialize base transforms if needed
    if (!this.viewModel.userData.basePosition) {
      this.viewModel.userData.basePosition = this.viewModel.position.clone();
      this.viewModel.userData.baseRotation = this.viewModel.rotation.clone();
    }

    const basePos: THREE.Vector3 = this.viewModel.userData.basePosition;
    const baseRot: THREE.Euler = this.viewModel.userData.baseRotation;

    const isMoving =
      this.moveForward || this.moveBackward || this.moveLeft || this.moveRight;

    // Bobbing parameters
    const walkFreq = 8;
    const walkAmpY = 0.03;
    const walkAmpX = 0.02;
    const rotAmpZ = 0.03;

    if (isMoving) {
      this.bobTime += delta * walkFreq;
      const bobY = Math.abs(Math.sin(this.bobTime)) * walkAmpY;
      const bobX = Math.sin(this.bobTime * 2) * walkAmpX;
      const rotZ = Math.sin(this.bobTime) * rotAmpZ;

      this.viewModel.position.set(
        basePos.x + bobX,
        basePos.y - bobY,
        basePos.z,
      );
      this.viewModel.rotation.set(baseRot.x, baseRot.y, baseRot.z + rotZ);
    } else {
      // Smoothly return to base pose when not moving
      this.bobTime = 0;
      this.viewModel.position.lerp(basePos, Math.min(1, delta * 10));
      // Slerp-like for Euler: lerp each component.
      this.viewModel.rotation.x +=
        (baseRot.x - this.viewModel.rotation.x) * Math.min(1, delta * 10);
      this.viewModel.rotation.y +=
        (baseRot.y - this.viewModel.rotation.y) * Math.min(1, delta * 10);
      this.viewModel.rotation.z +=
        (baseRot.z - this.viewModel.rotation.z) * Math.min(1, delta * 10);
    }
  }
}

export default Player;
