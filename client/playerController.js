/**
 * client/playerController.js
 * 
 * Production-ready player input handling and movement control.
 * Implements all keybindings for movement, blink, attachment, and broadcasts.
 */

const CONFIG = (window.GAME_TYPES && window.GAME_TYPES.GAME_CONSTANTS) || {};

class PlayerController {
  // TOP OF CLASS (after constructor fields)
  constructor(scene, network, ui) {
    this.scene = scene;
    this.network = network;
    this.ui = ui; // to be set externally

    // Local player state
    this.position = { x: 0, y: 1, z: 0 };
    this.rotation = { x: 0, y: 0, z: 0 }; // pitch, yaw, roll
    this.gaze = { x: 0, y: 0, z: 1 };     // normalized direction facing

    // Input state
    this.keys = {};
    this.mouseDelta = { x: 0, y: 0 };

    // Blink timing
    this.lastAutoBlinkTime = Date.now();   // auto-blink timer start
    this.isScreenBlack = false;           // black screen effect flag
    this.blackScreenEndTime = 0;          // when to end black screen

    // Attachment state (local tracking)
    this.isAttached = false;
    this.attachedTo = null;
    this.isControlling = true; // if attached, am I controlling movement?

    // Detach double-press tracking
    this.lastUPressTime = 0;
    this.detachPressCount = 0;

    // Attachment state (local tracking)
    this.attachRequest = null; // { from, to, state }
    this.targetedPlayer = null; // Player currently being pointed at

    // Spectator (dead) camera state
    this.isSpectator = false;
    this.spectatorHeight = 12;
    this.spectatorSpeed = 20;

    // Setup event listeners
    this.setupInputListeners();
  }
  // HANDLE DISCRETE KEYS
  handleKeyDown(event) {
    const key = event.key.toLowerCase();

    // Blink action (manual, refresh auto timer)
    if (key === 'r') {
      this.triggerBlink();           // local visual blink + timer reset
      this.network.sendBlink();      // tell server to blink
      return;
    }

    // Attachment requests
    if (key === 'v') {
      this.handleVPress();
      return;
    }

    if (key === 'x') {
      this.handleXPress();
      return;
    }

    // Detach (requires double press)
    if (key === 'u') {
      this.handleUPress();
      return;
    }

    // Broadcast blink timer to nearby
    if (key === 'i') {
      this.network.sendBroadcastTimer();
      return;
    }

    // Signal orb direction (O) and monster direction (P) when attached
    if (key === 'o') {
      if (this.attachedTo) {
        this.network.socket.emit('signal_orb', { gaze: this.gaze });
      }
      return;
    }

    if (key === 'p') {
      if (this.attachedTo) {
        this.network.socket.emit('signal_monster', { gaze: this.gaze });
      }
      return;
    }

    // Request control when attached (N)
    if (key === 'n') {
      if (this.attachedTo) {
        this.network.socket.emit('control_request', { targetPlayerId: this.attachedTo });
      }
      return;
    }
  }


  /**
   * Set up keyboard and mouse input listeners
   */
  setupInputListeners() {
    // Keyboard
    window.addEventListener('keydown', (e) => {
      const key = e.key.toLowerCase();
      this.keys[key] = true;
      // Handle double-U detach logic
      if (key === 'u') {
        const now = Date.now();
        if (now - this.lastUPressTime < 500) {
          // double press
          this.network.socket.emit('detach', {});
        }
        this.lastUPressTime = now;
      }
      this.handleKeyDown(e);
    });

    window.addEventListener('keyup', (e) => {
      this.keys[e.key.toLowerCase()] = false;
    });

    // Mouse movement (for looking around)
    window.addEventListener('mousemove', (e) => {
      this.mouseDelta.x = e.movementX;
      this.mouseDelta.y = e.movementY;
    });

    // Mouse lock for first-person control
    window.addEventListener('click', () => {
      document.body.requestPointerLock?.();
    });
  }

  /**
   * Handle discrete key presses (not continuous)
   */

  // TODO: Implement O and P signals (orb/monster in direction) shows on minimap
  // TODO: Implement N for control request

  /**
   * V key - attachment request or accept
   */
  handleVPress() {
    // Find player being pointed at (within 30 unit range, center of screen)
    const targetPlayer = this.findTargetedPlayer();

    if (targetPlayer) {
      // Request attachment with this player
      this.network.sendAttachRequest(targetPlayer.id);
      console.log('[PlayerController] Sent attach request to:', targetPlayer.username);
    }
  }

  /**
   * X key - decline attachment or cancel request
   */
  handleXPress() {
    // Cancel pending attachment request
    if (this.attachRequest) {
      this.network.sendAttachDecline(this.attachRequest.from);
      this.attachRequest = null;
      console.log('[PlayerController] Declined attachment');
    }
  }

  /**
   * Find the player being pointed at (raycasting from center screen)
   */
  findTargetedPlayer() {
    if (!window.gameClient?.gameState?.players) return null;

    const players = window.gameClient.gameState.players || [];
    const maxDistance = 800; // Can target players within 800 units

    // Find closest player in front
    let closest = null;
    let closestDistance = maxDistance;

    for (const p of players) {
      if (p.id === window.gameClient.network.playerId) continue; // Skip self
      if (p.state === 'dead') continue; // Skip dead players

      const dx = this.position.x - p.position.x;
      const dy = this.position.y - p.position.y;
      const dz = this.position.z - p.position.z;
      const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

      if (distance < closestDistance) {
        // Check if player is roughly in front (within 90 degree cone)
        const dot = (dx * this.gaze.x + dz * this.gaze.z) / (Math.sqrt(dx * dx + dz * dz) || 1);
        if (dot > 0.3) { // cos(72°) ≈ 0.31, so about 72 degree cone
          closest = p;
          closestDistance = distance;
        }
      }
    }

    return closest;
  }

  /**
   * U key - double-press to detach
   */
  handleUPress() {
    const now = Date.now();
    const timeSinceLastPress = now - this.lastUPressTime;

    if (timeSinceLastPress < 500) {
      // Double press detected
      this.detachPressCount++;
      if (this.detachPressCount >= 2) {
        this.network.sendDetach();
        this.detachPressCount = 0;
      }
    } else {
      // New press sequence
      this.detachPressCount = 1;
    }

    this.lastUPressTime = now;
  }

  /**
   * Update local player state based on input
   * Called every frame
   */
  /**
 * Update local player state based on input
 * Called every frame
 */
  update(deltaTime) {
    const now = Date.now();

    // If in spectator mode (dead), skip gameplay timers and only move camera
    if (this.isSpectator) {
      this.updateRotation();
      this.updateSpectatorMovement(deltaTime);
      this.updateGaze();
      if (this.scene) {
        this.scene.updateCamera(this.position, this.rotation);
      }
      return;
    }

    const remainingMs = CONFIG.PLAYER_BLINK_MAX_TIME - (now - this.lastAutoBlinkTime);
    let remaining = remainingMs / 1000;
    if (!Number.isFinite(remaining) || remaining < 0) remaining = 0;

    // playerController.update 中
    if (this.ui && typeof this.ui.updateBlinkTimer === 'function') {
      this.ui.updateBlinkTimer(remaining);
    }


    // Auto blink every 15 seconds if not manually refreshed
    if (now - this.lastAutoBlinkTime >= 15000) {
      this.triggerBlink();
      this.network.sendBlink();
    }

    // End black screen after 0.3 seconds
    if (this.isScreenBlack && now >= this.blackScreenEndTime) {
      this.isScreenBlack = false;
    }

    //console.log('[Controller.update] keys=', this.keys, 'pos=', this.position.x.toFixed(1), this.position.z.toFixed(1));

    // Update position based on WASD input
    this.updateMovement(deltaTime);

    // Update rotation based on mouse input
    this.updateRotation();

    // Update gaze direction based on rotation
    this.updateGaze();

    // Send position update to server (rate-limited by network layer)
    // Send discrete args to match network.sendPlayerInput signature
    this.network.sendPlayerInput(this.position, this.rotation, this.gaze);

    // Update camera
    if (this.scene) {
      this.scene.updateCamera(this.position, this.rotation);
    }
  }

  /**
   * Move spectator camera (dead player) using WASD, keeping a higher vantage point.
   */
  updateSpectatorMovement(deltaTime) {
    const speed = this.spectatorSpeed;
    const moveDistance = speed * deltaTime;

    // Flattened forward/right vectors from yaw only
    const yaw = this.rotation.y;
    const forward = { x: Math.sin(yaw), z: Math.cos(yaw) };
    const right = { x: Math.cos(yaw), z: -Math.sin(yaw) };

    let moveX = 0;
    let moveZ = 0;

    if (this.keys['w']) { moveX += forward.x * moveDistance; moveZ += forward.z * moveDistance; }
    if (this.keys['s']) { moveX -= forward.x * moveDistance; moveZ -= forward.z * moveDistance; }
    if (this.keys['a']) { moveX -= right.x * moveDistance; moveZ -= right.z * moveDistance; }
    if (this.keys['d']) { moveX += right.x * moveDistance; moveZ += right.z * moveDistance; }

    this.position.x += moveX;
    this.position.z += moveZ;
    // Keep elevated spectator height
    this.position.y = Math.max(this.spectatorHeight, this.position.y);
  }


  // In handleKeyDown



  /**
   * Update player position based on WASD movement
   */
  /**
 * Update player position based on WASD movement
 * W = forward (toward gaze)
 * S = backward
 * A = 90° left of gaze
 * D = 90° right of gaze
 *//**
                                                              * Update player position based on WASD movement
                                                              * W = forward (toward gaze)
                                                              * S = backward
                                                              * A = 90° left of gaze
                                                              * D = 90° right of gaze
                                                              */
  updateMovement(deltaTime) {
    const MOVE_SPEED = 20; // units per second (tweak as needed)
    const backwardMultiplier = (CONFIG && CONFIG.PLAYER_BACKWARD_SPEED_MULTIPLIER) || 0.5;

    // Horizontal forward direction from gaze (y ignored)
    const forward = {
      x: this.gaze.x,
      z: this.gaze.z
    };
    const forwardLen = Math.sqrt(forward.x * forward.x + forward.z * forward.z) || 1;
    forward.x /= forwardLen;
    forward.z /= forwardLen;

    // Right is +90° from forward (in XZ plane)
    const right = {
      x: forward.z,
      z: -forward.x
    };

    let moveX = 0;
    let moveZ = 0;

    if (this.keys['w']) {
      moveX -= forward.x;
      moveZ -= forward.z;
    }
    if (this.keys['s']) {
      moveX += forward.x;
      moveZ += forward.z;
    }
    if (this.keys['a']) {
      moveX -= right.x;
      moveZ -= right.z;
    }
    if (this.keys['d']) {
      moveX += right.x;
      moveZ += right.z;
    }

    const moveLen = Math.sqrt(moveX * moveX + moveZ * moveZ);
    if (moveLen > 0) {
      moveX /= moveLen;
      moveZ /= moveLen;
      // Apply slower speed when moving backward (S without W)
      let speed = MOVE_SPEED;
      if (this.keys['s'] && !this.keys['w']) {
        speed *= backwardMultiplier;
      }

      const distance = speed * deltaTime;
      const newX = this.position.x + moveX * distance;
      const newZ = this.position.z + moveZ * distance;

      // Simple collision: reuse server obstacle layout
      if (!this.isPositionBlocked(newX, newZ)) {
        this.position.x = newX;
        this.position.z = newZ;
      } else {
        // Try sliding on X axis
        if (!this.isPositionBlocked(newX, this.position.z)) {
          this.position.x = newX;
        } else if (!this.isPositionBlocked(this.position.x, newZ)) {
          // Or sliding on Z axis
          this.position.z = newZ;
        }
      }
    }
  }


  /**
   * Client-side collision check using same boxes as server
   */


  isPositionBlocked(x, z) {
    // Prefer authoritative obstacle list from server/gameState if available
    const serverObs = window.gameClient?.gameState?.obstacles;
    const obstacles = Array.isArray(serverObs) && serverObs.length > 0 ? serverObs.map(o => ({
      x: o.position.x,
      z: o.position.z,
      w: o.width || (o.w || 6),
      d: o.depth || (o.d || 6)
    })) : [
      // fallback static obstacles if server list unavailable
      { x: 40, z: 40, w: 8, d: 8 },
      { x: -50, z: 30, w: 6, d: 6 },
      { x: 0, z: -60, w: 10, d: 10 },
      { x: -40, z: -40, w: 5, d: 5 },
      { x: 60, z: -20, w: 7, d: 7 },
      { x: -30, z: 0, w: 6, d: 6 }
    ];

    for (const obs of obstacles) {
      const minX = obs.x - obs.w / 2;
      const maxX = obs.x + obs.w / 2;
      const minZ = obs.z - obs.d / 2;
      const maxZ = obs.z + obs.d / 2;

      if (x >= minX && x <= maxX && z >= minZ && z <= maxZ) {
        return true;
      }
    }
    return false;
  }



  /**
   * Update rotation based on mouse movement
   */
  updateRotation() {
    const MOUSE_SENSITIVITY = 0.005;

    // Pitch (up/down): rotation.x
    // Yaw (left/right): rotation.y
    this.rotation.y -= this.mouseDelta.x * MOUSE_SENSITIVITY;
    this.rotation.x -= this.mouseDelta.y * MOUSE_SENSITIVITY;

    // Clamp pitch to prevent over-rotating
    const maxPitch = Math.PI / 2 - 0.1;
    this.rotation.x = Math.max(-maxPitch, Math.min(maxPitch, this.rotation.x));

    // Wrap yaw around 2π
    while (this.rotation.y > Math.PI) this.rotation.y -= 2 * Math.PI;
    while (this.rotation.y < -Math.PI) this.rotation.y += 2 * Math.PI;

    // Reset mouse delta
    this.mouseDelta.x = 0;
    this.mouseDelta.y = 0;
  }

  /**
   * Calculate gaze direction from rotation
   * Used for monster blind spot detection and signal direction
   */
  updateGaze() {
    const cosX = Math.cos(this.rotation.x);
    const sinX = Math.sin(this.rotation.x);
    const cosY = Math.cos(this.rotation.y);
    const sinY = Math.sin(this.rotation.y);

    this.gaze.x = sinY * cosX;
    this.gaze.y = sinX;
    this.gaze.z = cosY * cosX;

    // Normalize gaze vector
    const gazeLen = Math.sqrt(
      this.gaze.x * this.gaze.x + this.gaze.y * this.gaze.y + this.gaze.z * this.gaze.z
    );
    if (gazeLen > 0) {
      this.gaze.x /= gazeLen;
      this.gaze.y /= gazeLen;
      this.gaze.z /= gazeLen;
    }
  }

  /**
   * Enter spectator (dead) mode, lifting camera and pitching downward.
   */
  enterSpectator(basePosition) {
    this.isSpectator = true;
    this.position = {
      x: basePosition?.x ?? this.position.x,
      y: (basePosition?.y ?? this.position.y) + this.spectatorHeight,
      z: basePosition?.z ?? this.position.z,
    };
    // Look downward at a 45° angle by default
    this.rotation.x = -Math.PI / 4;
    // Keep current yaw if available
    this.updateGaze();
  }

  /**
   * Exit spectator mode (e.g., on respawn/new match)
   */
  exitSpectator(basePosition) {
    this.isSpectator = false;
    if (basePosition) {
      this.position = { ...basePosition };
    }
  }
  /**
 * Trigger a blink:
 * - screen black for 0.3s
 * - refresh 15s timer
 */
  triggerBlink() {
    const now = Date.now();
    this.lastAutoBlinkTime = now;
    this.isScreenBlack = true;
    this.blackScreenEndTime = now + 300;
    document.body.style.opacity = 0;
    setTimeout(() => { document.body.style.opacity = 1; }, 300);

  }


  /**
   * Set player position from server correction
   */
  setPosition(position) {
    // Only apply large corrections to prevent jitter
    const dx = position.x - this.position.x;
    const dy = position.y - this.position.y;
    const dz = position.z - this.position.z;
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

    if (distance > 5) {
      // Large correction from server (only for major desync)
      console.log('[Controller] Position correction:', distance.toFixed(2), 'units');
      this.position = { ...position };
    }
  }

  /**
   * Get current player state
   */
  getState() {
    return {
      position: { ...this.position },
      rotation: { ...this.rotation },
      gaze: { ...this.gaze }
    };
  }
}
window.PlayerController = PlayerController;
