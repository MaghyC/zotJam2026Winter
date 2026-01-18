/**
 * client/scene.js
 * 
 * Three.js 3D rendering system for the game arena.
 * Manages scene geometry, lighting, player/monster/orb meshes, and camera.
 */

// Three.js is loaded globally via CDN

class GameScene {
  constructor(containerElement) {
    this.container = containerElement;
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.playerMeshes = new Map();
    this.monsterMeshes = new Map();
    this.orbMeshes = new Map();
    this.arenaSafeRadius = 100;

    // Fullscreen black overlay for blink effect
    this.blackOverlay = null;

    this.init();
    // Create black overlay for blink
    this.createBlackOverlay();

  }


  /**
   * Initialize Three.js scene
   */
  init() {
    // Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0a0a);
    this.scene.fog = new THREE.Fog(0x0a0a0a, 300, 600);

    // Camera: First-person at eye level
    this.camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    this.camera.position.y = 1.8; // Eye height

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.container.appendChild(this.renderer.domElement);

    // Lighting
    this.setupLights();

    // Arena
    this.createArena();

    // Handle resize
    window.addEventListener('resize', () => this.onWindowResize());
  }

  /**
   * Setup lighting system
   */
  setupLights() {
    // Ambient light
    const ambient = new THREE.AmbientLight(0xffffff, 0.5);
    this.scene.add(ambient);

    // Directional light (sun)
    const sun = new THREE.DirectionalLight(0xffffff, 0.8);
    sun.position.set(100, 150, 100);
    sun.castShadow = true;
    sun.shadow.camera.left = -200;
    sun.shadow.camera.right = 200;
    sun.shadow.camera.top = 200;
    sun.shadow.camera.bottom = -200;
    sun.shadow.mapSize.width = 2048;
    sun.shadow.mapSize.height = 2048;
    this.scene.add(sun);

    // Spotlight for drama
    const spot = new THREE.SpotLight(0x00ff88, 0.4);
    spot.position.set(0, 80, 0);
    spot.target.position.set(0, 0, 0);
    spot.castShadow = true;
    spot.angle = Math.PI / 3;
    this.scene.add(spot);
    this.scene.add(spot.target);
  }

  /**
   * Create arena geometry
   */
  createArena() {
    const group = new THREE.Group();

    // Floor: circular arena base (radius 100)
    const floorGeom = new THREE.CylinderGeometry(100, 100, 1, 64);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x1a3a1a,
      roughness: 0.8
    });
    const floor = new THREE.Mesh(floorGeom, floorMat);
    floor.receiveShadow = true;
    floor.position.y = -0.5;
    group.add(floor);

    // Safe zone indicator (shrinking circle)
    const sageZoneGeom = new THREE.TorusGeometry(100, 0.5, 16, 200);
    const safeZoneMat = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
    this.safeZoneMesh = new THREE.Mesh(sageZoneGeom, safeZoneMat);
    this.safeZoneMesh.position.y = 0.1;
    this.safeZoneMesh.rotation.x = -Math.PI / 2;
    group.add(this.safeZoneMesh);

    // Outer walls
    const wallGeom = new THREE.CylinderGeometry(120, 120, 60, 64);
    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x2a2a2a,
      roughness: 0.9
    });
    const walls = new THREE.Mesh(wallGeom, wallMat);
    walls.receiveShadow = true;
    walls.position.y = 30;
    group.add(walls);

    // Obstacles for cover
    this.createObstacles(group);

    this.scene.add(group);
  }

  /**
   * Create scattered obstacles for cover/gameplay
   */
  createObstacles(parentGroup) {
    const obstacles = [
      { x: 40, z: 40, w: 8, h: 10, d: 8 },
      { x: -50, z: 30, w: 6, h: 8, d: 6 },
      { x: 0, z: -60, w: 10, h: 12, d: 10 },
      { x: -40, z: -40, w: 5, h: 7, d: 5 },
      { x: 60, z: -20, w: 7, h: 9, d: 7 },
      { x: -30, z: 0, w: 6, h: 8, d: 6 }
    ];

    for (const obs of obstacles) {
      const geom = new THREE.BoxGeometry(obs.w, obs.h, obs.d);
      const mat = new THREE.MeshStandardMaterial({
        color: 0x8b7355,
        roughness: 0.8
      });
      const mesh = new THREE.Mesh(geom, mat);
      mesh.position.set(obs.x, obs.h / 2, obs.z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      parentGroup.add(mesh);
    }
  }


  /**
   * Update player meshes from server state
   */
  updatePlayers(players) {
    const serverIds = new Set();
    const localPlayerId = window.gameClient?.network?.playerId;

    for (const player of players) {

      // Skip dead players - don't render them
      if (player.state === 'dead') {
        continue;
      }

      serverIds.add(player.id);

      // Skip rendering local player (first-person view)
      if (player.id === localPlayerId) {
        continue;
      }

      let mesh = this.playerMeshes.get(player.id);
      if (!mesh) {
        // Create new player mesh for OTHER players
        console.log(`[Scene] Creating mesh for player ${player.id.slice(0, 6)}`);
        const geom = new THREE.BoxGeometry(0.9, 1.8, 2.2);
        const mat = new THREE.MeshStandardMaterial({
          color: player.attachmentState === 'ATTACHED' ? 0x00ff00 : 0x0066ff,
          metalness: 0.3,
          roughness: 0.6,
          emissive: player.attachmentState === 'ATTACHED' ? 0x00aa00 : 0x0044aa
        });

        mesh = new THREE.Mesh(geom, mat);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        // Add simple gaze indicator (a small box in front of "head")
        const gazeGeom = new THREE.BoxGeometry(0.1, 0.1, 1.0); // thin rectangular box
        const gazeMat = new THREE.MeshBasicMaterial({ color: 0xffff00 });
        const gazeMesh = new THREE.Mesh(gazeGeom, gazeMat);
        gazeMesh.position.set(0, 0.9, -1.5);
        gazeMesh.name = "gazeIndicator";
        mesh.add(gazeMesh);


        this.scene.add(mesh);
        this.playerMeshes.set(player.id, mesh);
        //console.log('[Scene] Created mesh for player:', player.id, player.username);
      }

      // Update position and rotation from server data
      //console.log(`[Scene] Updating player ${player.id.slice(0, 6)} mesh to pos=(${player.position.x.toFixed(1)}, ${player.position.z.toFixed(1)})`);
      mesh.position.set(player.position.x, player.position.y, player.position.z);

      if (player.rotation) {
        // Use explicit Euler components and a valid order
        mesh.rotation.set(
          player.rotation.x || 0,
          player.rotation.y || 0,
          player.rotation.z || 0,
          "YXZ"   // or "XYZ", but match your camera order
        );
      }


      // Update color based on attachment state
      if (mesh.material) {
        mesh.material.color.setHex(
          (player.attachmentState === 'attached') ? 0x00ff00 : 0x0066ff
        );
      }
    }

    // Remove meshes for players no longer in game or dead
    for (const [id, mesh] of this.playerMeshes.entries()) {
      if (!serverIds.has(id)) {
        this.scene.remove(mesh);
        this.playerMeshes.delete(id);
        console.log('[Scene] Removed mesh for player:', id);
      }
    }
  }

  /**
   * Update monster meshes from server state
   */
  updateMonsters(monsters) {
    const serverIds = new Set();

    for (const monster of monsters) {
      serverIds.add(monster.id);

      let mesh = this.monsterMeshes.get(monster.id);
      if (!mesh) {
        // Create new monster mesh
        const geom = new THREE.IcosahedronGeometry(2, 4);
        const mat = new THREE.MeshStandardMaterial({
          color: 0xff3333,
          metalness: 0.6,
          roughness: 0.4,
          emissive: 0xff0000,
          emissiveIntensity: 0.3
        });
        mesh = new THREE.Mesh(geom, mat);
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        // Add glow layer
        const glowGeom = new THREE.IcosahedronGeometry(0.95, 4);
        const glowMat = new THREE.MeshBasicMaterial({
          color: 0xff0000,
          transparent: true,
          opacity: 0.2
        });
        const glow = new THREE.Mesh(glowGeom, glowMat);
        mesh.add(glow);

        this.scene.add(mesh);
        this.monsterMeshes.set(monster.id, mesh);
      }

      // Update position
      mesh.position.set(monster.position.x, monster.position.y, monster.position.z);

      // Color: red if roaring, orange if hunting
      const isRoaring = monster.state === 'ROARING';
      if (mesh.material) {
        mesh.material.color.setHex(isRoaring ? 0xff0000 : 0xff6600);
        mesh.material.emissive.setHex(isRoaring ? 0xff0000 : 0xff6600);
      }
    }

    // Remove meshes for monsters no longer in game
    for (const [id, mesh] of this.monsterMeshes.entries()) {
      if (!serverIds.has(id)) {
        this.scene.remove(mesh);
        this.monsterMeshes.delete(id);
      }
    }
  }

  /**
   * Update orb meshes from server state
   */
  updateOrbs(orbs) {
    const serverIds = new Set();

    for (const orb of orbs) {
      serverIds.add(orb.id);

      let mesh = this.orbMeshes.get(orb.id);
      if (!mesh) {
        // Create new orb mesh
        const geom = new THREE.SphereGeometry(0.3, 32, 32);
        const mat = new THREE.MeshStandardMaterial({
          color: 0xffff00,
          metalness: 0.9,
          roughness: 0.1,
          emissive: 0xffff00,
          emissiveIntensity: 0.6
        });
        mesh = new THREE.Mesh(geom, mat);
        mesh.castShadow = true;
        mesh.userData.rotation = 0;
        this.scene.add(mesh);
        this.orbMeshes.set(orb.id, mesh);
      }

      // Update position and rotate
      mesh.position.set(orb.position.x, orb.position.y, orb.position.z);
      mesh.userData.rotation += 0.05;
      mesh.rotation.y = mesh.userData.rotation;
    }

    // Remove meshes for orbs no longer in game
    for (const [id, mesh] of this.orbMeshes.entries()) {
      if (!serverIds.has(id)) {
        this.scene.remove(mesh);
        this.orbMeshes.delete(id);
      }
    }
  }

  /**
   * Update arena safe zone radius indicator
   */
  updateArenaSafeRadius(radius) {
    this.arenaSafeRadius = radius;
    if (this.safeZoneMesh) {
      const scale = radius / 100;
      this.safeZoneMesh.scale.set(scale, scale, scale);

      // Color: green if safe, red if danger zone
      if (radius > 30) {
        this.safeZoneMesh.material.color.setHex(0x00ff00);
      } else {
        this.safeZoneMesh.material.color.setHex(0xff0000);
      }
    }
  }

  /**
   * Update camera position (first-person view)
   */
  updateCamera(position, rotation) {
    // Camera follows player position at eye level
    this.camera.position.set(
      position.x,
      position.y + 1.6, // Eye height
      position.z
    );

    if (rotation) {
      this.camera.rotation.order = 'YXZ';
      this.camera.rotation.y = rotation.y;
      this.camera.rotation.x = rotation.x;
    }
  }

  /**
   * Render the scene
   */
  render() {
    this.renderer.autoClear = true;
    this.renderer.render(this.scene, this.camera);

    if (this.blackOverlay && this.blackOverlay.visible) {
      this.renderer.autoClear = false;
      this.renderer.render(this.overlayScene, this.camera);
      this.renderer.autoClear = true;
    }
  }

  /**
   * Handle window resize
   */
  onWindowResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  /**
 * Create a fullscreen black overlay DOM element
 */
  // New method in GameScene
  createBlackOverlay() {
    const geom = new THREE.PlaneGeometry(2, 2);
    const mat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 1 });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.position.z = -1;
    this.blackOverlay = mesh;

    // Use orthographic full-screen quad via camera's post-processing-like layer
    const overlayScene = new THREE.Scene();
    overlayScene.add(mesh);
    this.overlayScene = overlayScene;
  }


  /**
   * Turn black overlay on/off
   */
  setBlackOverlay(enabled) {
    if (!this.blackOverlay) return;
    this.blackOverlay.visible = enabled;
  }


}
