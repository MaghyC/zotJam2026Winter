/**
 * client/scene.js
 * 
 * Sets up the 3D coliseum arena using Three.js.
 * 
 * Responsibilities:
 * - Create Three.js scene, camera, lights
 * - Generate coliseum geometry (walls, floor, obstacles)
 * - Manage player/monster/orb rendering objects
 * - Update render loop
 * 
 * Learning Note:
 * Three.js uses a right-handed coordinate system:
 * - X axis: right
 * - Y axis: up
 * - Z axis: toward viewer
 */

import * as THREE from 'three';

export class Scene {
  constructor() {
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.coliseum = null;
    this.playerMeshes = new Map(); // playerId -> THREE.Mesh
    this.monsterMeshes = new Map(); // monsterId -> THREE.Mesh
    this.orbMeshes = new Map(); // orbId -> THREE.Mesh
  }

  /**
   * Initialize the Three.js scene
   */
  initialize(canvas) {
    // Scene setup
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0a0a);
    this.scene.fog = new THREE.Fog(0x0a0a0a, 200, 500);

    // Camera setup
    this.camera = new THREE.PerspectiveCamera(
      75, // field of view
      window.innerWidth / window.innerHeight, // aspect ratio
      0.1, // near clipping
      1000 // far clipping
    );
    this.camera.position.set(0, 2, 5);

    // Renderer setup
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowShadowMap;

    // Lighting
    this.setupLights();

    // Build coliseum arena
    this.createColiseum();

    // Handle window resize
    window.addEventListener('resize', () => this.onWindowResize());
  }

  /**
   * Set up scene lighting
   * Using directional light (like sun) and ambient light
   */
  setupLights() {
    // Ambient light - provides base illumination
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    this.scene.add(ambientLight);

    // Directional light - creates shadows and highlights
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(50, 100, 50);
    directionalLight.castShadow = true;

    // Set up shadow camera for the light
    directionalLight.shadow.camera.left = -150;
    directionalLight.shadow.camera.right = 150;
    directionalLight.shadow.camera.top = 150;
    directionalLight.shadow.camera.bottom = -150;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;

    this.scene.add(directionalLight);

    // Spotlight for effect
    const spotlight = new THREE.SpotLight(0x0088ff, 0.3);
    spotlight.position.set(0, 50, 0);
    spotlight.target.position.set(0, 0, 0);
    spotlight.castShadow = true;
    this.scene.add(spotlight);
    this.scene.add(spotlight.target);
  }

  /**
   * Create the coliseum arena
   * Simplified: cylinder floor with walls
   */
  createColiseum() {
    const group = new THREE.Group();

    // Floor - circular arena base
    const floorGeometry = new THREE.CylinderGeometry(
      100, // radius
      100,
      1, // height
      64 // segments
    );
    const floorMaterial = new THREE.MeshStandardMaterial({
      color: 0x1a4d2e,
      metalness: 0.1,
      roughness: 0.8,
    });
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.position.y = 0;
    floor.receiveShadow = true;
    group.add(floor);

    // Walls - outer coliseum walls
    const wallGeometry = new THREE.CylinderGeometry(
      120, // outer radius
      120,
      50, // height
      64
    );
    const wallMaterial = new THREE.MeshStandardMaterial({
      color: 0x4a4a4a,
      metalness: 0.2,
      roughness: 0.9,
    });
    const walls = new THREE.Mesh(wallGeometry, wallMaterial);
    walls.position.y = 25;
    walls.receiveShadow = true;
    group.add(walls);

    // Add some obstacles in the arena
    this.createObstacles(group);

    this.coliseum = group;
    this.scene.add(group);
  }

  /**
   * Create obstacles scattered in arena
   * These serve as cover and visual interest
   */
  createObstacles(parentGroup) {
    const obstacles = [
      { x: 30, z: 30, size: 5 },
      { x: -40, z: 20, size: 4 },
      { x: 0, z: -50, size: 6 },
      { x: -30, z: -30, size: 3 },
      { x: 50, z: -10, size: 4 },
    ];

    for (const obs of obstacles) {
      const boxGeometry = new THREE.BoxGeometry(obs.size, obs.size * 2, obs.size);
      const boxMaterial = new THREE.MeshStandardMaterial({
        color: 0x8b7355,
        metalness: 0,
        roughness: 0.8,
      });
      const box = new THREE.Mesh(boxGeometry, boxMaterial);
      box.position.set(obs.x, obs.size, obs.z);
      box.castShadow = true;
      box.receiveShadow = true;
      parentGroup.add(box);
    }
  }

  /**
   * Create a mesh for a player
   */
  createPlayerMesh(playerId, initialPosition) {
    const geometry = new THREE.CapsuleGeometry(0.4, 1.8, 4, 8);
    const material = new THREE.MeshStandardMaterial({
      color: 0x0066ff,
      metalness: 0.5,
      roughness: 0.5,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(initialPosition);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    this.scene.add(mesh);
    this.playerMeshes.set(playerId, mesh);

    return mesh;
  }

  /**
   * Create a mesh for a monster
   */
  createMonsterMesh(monsterId, initialPosition) {
    const geometry = new THREE.IcosahedronGeometry(0.8, 4);
    const material = new THREE.MeshStandardMaterial({
      color: 0xff3333,
      metalness: 0.7,
      roughness: 0.3,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(initialPosition);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    // Add a red glow effect
    const glowGeometry = new THREE.IcosahedronGeometry(0.9, 4);
    const glowMaterial = new THREE.MeshBasicMaterial({
      color: 0xff0000,
      transparent: true,
      opacity: 0.3,
    });
    const glow = new THREE.Mesh(glowGeometry, glowMaterial);
    mesh.add(glow);

    this.scene.add(mesh);
    this.monsterMeshes.set(monsterId, mesh);

    return mesh;
  }

  /**
   * Create a mesh for an orb
   */
  createOrbMesh(orbId, position) {
    const geometry = new THREE.SphereGeometry(0.3, 32, 32);
    const material = new THREE.MeshStandardMaterial({
      color: 0xffff00,
      metalness: 0.9,
      roughness: 0.1,
      emissive: 0xffff00,
      emissiveIntensity: 0.5,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(position);
    mesh.castShadow = true;

    // Spinning animation (handled in update loop)
    mesh.userData.rotationSpeed = 0.02;

    this.scene.add(mesh);
    this.orbMeshes.set(orbId, mesh);

    return mesh;
  }

  /**
   * Update position and rotation of a player mesh
   */
  updatePlayerMesh(playerId, position, rotation) {
    const mesh = this.playerMeshes.get(playerId);
    if (mesh) {
      mesh.position.copy(position);
      mesh.rotation.copy(rotation);
    }
  }

  /**
   * Update position of a monster mesh
   */
  updateMonsterMesh(monsterId, position) {
    const mesh = this.monsterMeshes.get(monsterId);
    if (mesh) {
      mesh.position.copy(position);
    }
  }

  /**
   * Update camera to follow local player
   * First-person view: camera at player head level
   */
  updateCamera(playerPosition, playerRotation) {
    const headHeight = 0.8; // camera height above player position
    this.camera.position.set(
      playerPosition.x,
      playerPosition.y + headHeight,
      playerPosition.z
    );
    this.camera.rotation.copy(playerRotation);
  }

  /**
   * Render current scene
   */
  render() {
    // Update orbits (spinning animation)
    this.orbMeshes.forEach((mesh) => {
      mesh.rotation.y += mesh.userData.rotationSpeed;
    });

    this.renderer.render(this.scene, this.camera);
  }

  /**
   * Handle window resize
   */
  onWindowResize() {
    const width = window.innerWidth;
    const height = window.innerHeight;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  /**
   * Remove a player mesh
   */
  removePlayerMesh(playerId) {
    const mesh = this.playerMeshes.get(playerId);
    if (mesh) {
      this.scene.remove(mesh);
      this.playerMeshes.delete(playerId);
    }
  }

  /**
   * Remove a monster mesh
   */
  removeMonsterMesh(monsterId) {
    const mesh = this.monsterMeshes.get(monsterId);
    if (mesh) {
      this.scene.remove(mesh);
      this.monsterMeshes.delete(monsterId);
    }
  }

  /**
   * Remove an orb mesh
   */
  removeOrbMesh(orbId) {
    const mesh = this.orbMeshes.get(orbId);
    if (mesh) {
      this.scene.remove(mesh);
      this.orbMeshes.delete(orbId);
    }
  }

  /**
   * Get the Three.js scene for advanced manipulation
   */
  getScene() {
    return this.scene;
  }

  /**
   * Get the camera
   */
  getCamera() {
    return this.camera;
  }
}
