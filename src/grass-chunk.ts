import * as THREE from 'three';

export class GrassChunk {
  public mesh: THREE.Mesh;
  private material: THREE.ShaderMaterial;
  private placed: number;
  private geometry: THREE.InstancedBufferGeometry;

  constructor(options: {
    centerX: number;
    centerZ: number;
    width: number;
    depth: number;
    sampleHeight: (x: number, z: number) => number;
    waterLevel: number;
    bladeCount: number;
  }) {
    const {
      centerX,
      centerZ,
      width,
      depth,
      sampleHeight,
      waterLevel,
      bladeCount,
    } = options;
    // Use a simpler blade: single-segment plane (lower vertex count)
    const bladeGeometry = new THREE.PlaneGeometry(0.08, 0.4, 1, 1);
    bladeGeometry.translate(0, 0.6, 0);

    const geometry = new THREE.InstancedBufferGeometry();
    geometry.index = bladeGeometry.index;
    geometry.attributes.position = bladeGeometry.attributes.position;
    geometry.attributes.uv = bladeGeometry.attributes.uv;

    const offsets = new Float32Array(bladeCount * 3);
    const scales = new Float32Array(bladeCount);
    const rotations = new Float32Array(bladeCount);

    let placed = 0;

    for (let index = 0; index < bladeCount; index++) {
      const lx = Math.random() * width - width * 0.5;
      const lz = Math.random() * depth - depth * 0.5;

      const wx = centerX + lx;
      const wz = centerZ + lz;
      const height = sampleHeight(wx, wz);

      if (height <= waterLevel + 0.5) continue;

      offsets[placed * 3 + 0] = lx;
      offsets[placed * 3 + 1] = height;
      offsets[placed * 3 + 2] = lz;

      scales[placed] = 0.6 + Math.random() * 0.6;
      rotations[placed] = Math.random() * Math.PI;

      placed++;
    }

    geometry.setAttribute(
      'instanceOffset',
      new THREE.InstancedBufferAttribute(offsets, 3),
    );
    geometry.setAttribute(
      'instanceScale',
      new THREE.InstancedBufferAttribute(scales, 1),
    );
    geometry.setAttribute(
      'instanceRotation',
      new THREE.InstancedBufferAttribute(rotations, 1),
    );

    // Only draw the number of instances we actually placed
    geometry.instanceCount = placed;

    // Keep some references for LOD adjustments
    this.placed = placed;
    this.geometry = geometry;

    // Compute a conservative bounding sphere for the instanced geometry so
    // The renderer can frustum-cull grass chunks. Offsets are already in
    // Local space (centered around 0), so compute extents from them.
    if (placed > 0) {
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      let minZ = Infinity;
      let maxZ = -Infinity;
      for (let index = 0; index < placed; index++) {
        const ox = offsets[index * 3 + 0];
        const oy = offsets[index * 3 + 1];
        const oz = offsets[index * 3 + 2];
        if (ox < minX) minX = ox;
        if (ox > maxX) maxX = ox;
        if (oy < minY) minY = oy;
        if (oy > maxY) maxY = oy;
        if (oz < minZ) minZ = oz;
        if (oz > maxZ) maxZ = oz;
      }

      const cx = (minX + maxX) * 0.5;
      // Include blade geometry half-height
      const cy = (minY + maxY) * 0.5 + 0.6;
      const cz = (minZ + maxZ) * 0.5;

      // Max distance from center to corners (conservative)
      const dx = Math.max(Math.abs(minX - cx), Math.abs(maxX - cx));
      const dz = Math.max(Math.abs(minZ - cz), Math.abs(maxZ - cz));
      const dy = Math.max(Math.abs(minY - cy), Math.abs(maxY - cy));
      const radius = Math.hypot(dx, dz, dy);

      geometry.boundingSphere = new THREE.Sphere(
        new THREE.Vector3(cx, cy, cz),
        radius,
      );
    }

    this.material = new THREE.ShaderMaterial({
      fragmentShader: `
        precision mediump float;
        varying float vHeight;

        void main() {
          vec3 base = vec3(0.12, 0.45, 0.12);
          vec3 tip  = vec3(0.35, 0.65, 0.25);
          vec3 color = mix(base, tip, vHeight);
          gl_FragColor = vec4(color, 1.0);
        }
      `,
      side: THREE.DoubleSide,
      uniforms: {
        time: { value: 0 },
        windDir: { value: new THREE.Vector3(0, 0, 0) },
      },
      vertexShader: `
        precision mediump float;
        uniform float time;
        uniform vec3 windDir;

        attribute vec3 instanceOffset;
        attribute float instanceScale;
        attribute float instanceRotation;

        varying float vHeight;

        void main() {
          vec3 pos = position;

          float bend = pos.y;
          float wind =
            sin(time + instanceOffset.x * 0.08 + instanceOffset.z * 0.08);

          pos.x += windDir.x * wind * 0.25 * bend;
          pos.z += windDir.z * wind * 0.25 * bend;

          float c = cos(instanceRotation);
          float s = sin(instanceRotation);
          pos.xz = mat2(c, -s, s, c) * pos.xz;

          pos *= instanceScale;
          pos += instanceOffset;

          vHeight = clamp(pos.y, 0.0, 1.0);

          gl_Position =
            projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
        }
      `,
    });

    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.position.set(centerX, 0, centerZ);
    // Allow frustum culling now that we've computed a conservative
    // Bounding sphere for the instanced geometry.
    this.mesh.frustumCulled = true;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
  }

  /**
   * Update per-frame. Optionally provide camera world position to enable per-chunk LOD.
   */
  update(delta: number, cameraPos?: THREE.Vector3) {
    (this.material.uniforms.time as THREE.IUniform<number>).value += delta;

    if (cameraPos instanceof THREE.Vector3) {
      // Compute distance from camera to chunk center
      const worldPos = new THREE.Vector3();
      this.mesh.getWorldPosition(worldPos);
      const distance = worldPos.distanceTo(cameraPos);

      // Simple density LOD mapping
      let density = 1;
      if (distance > 350) density = 0;
      else if (distance > 200) density = 0.15;
      else if (distance > 80) density = 0.5;

      const desired = Math.max(0, Math.floor(this.placed * density));
      this.geometry.instanceCount = desired;
    }
  }

  dispose(parent: THREE.Object3D) {
    parent.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
