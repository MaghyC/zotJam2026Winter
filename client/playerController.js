/**
 * client/playerController.js
 * 
 * Handles input and local player movement control.
 * 
 * Input mapping:
 * - WASD: movement (forward, backward, strafe left/right)
 * - Mouse: look around (pitch and yaw)
 * - R: blink action
 * - V: attachment request / accept attachment
 * - X: decline attachment / cancel request
 * - U (double-press): detach
 * - I: broadcast blink timer
 * - O: signal "orb in this direction"
 * - P: signal "monster in this direction"
 * - N: request control (if attached)
 * - Left/Right Arrow: turn head (if attached and not controlling)
 * 
 * Client-side prediction:
 * This controller applies movement locally and sends updates to server.
 * Server is authoritative and can correct the client if needed.
 */

import {
  PLAYER_MOVEMENT_SPEED_FORWARD,
  PLAYER_MOVEMENT_SPEED_BACKWARD,
  PLAYER_MOVEMENT_SPEED_STRAFE,
  PLAYER_ROTATION_SPEED,
} from '../shared/constants.js';

export class PlayerController {
  constructor(scene, network) {
    this.scene = scene;
    this.network = network;

    // Local player state
    this.position = { x: 0, y: 1, z: 0 };
    this.rotation = { x: 0, y: 0, z: 0 }; // pitch, yaw, roll
    this.gaze = { x: 0, y: 0, z: 1 }; // normalized direction facing

    // Input state
    this.keys = {};
    this.mouseDelta = { x: 0, y: 0 };

    // Attachment state (local tracking)
    this.isAttached = false;
    this.attachedTo = null;
    this.isControlling = true; // if attached, am I controlling movement?

    // Detach double-press tracking
    this.lastUPressTime = 0;
    this.detachPressCount = 0;

    // Setup event listeners
    this.setupInputListeners();
  }

  /**
   * Set up keyboard and mouse input listeners
   */
  setupInputListeners() {
    // Keyboard
    window.addEventListener('keydown', (e) => {
      this.keys[e.key.toLowerCase()] = true;
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
  handleKeyDown(event) {
    const key = event.key.toLowerCase();

    // Blink action
    if (key === 'r') {
      this.network.sendBlink();
    }

    // Attachment requests
    if (key === 'v') {
      this.handleVPress();
    }

    if (key === 'x') {
      this.handleXPress();
    }

    // Detach (requires double press)
    if (key === 'u') {
      this.handleUPress();
    }

    // Broadcast blink timer to nearby
    if (key === 'i') {
      this.network.sendBlinkTimerBroadcast();
    }

    // TODO: Implement O and P signals (orb/monster in direction)
    // TODO: Implement N for control request
    // TODO: Implement arrow keys for head turning
  }

  /**
   * V key - request attach / accept attachment / request control
   */
  handleVPress() {
    console.log('V pressed - attach/accept action');
    // TODO: Implement based on current attachment state
  }

  /**
   * X key - decline attachment / cancel request
   */
  handleXPress() {
    console.log('X pressed - decline/cancel action');
    // TODO: Implement
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
  update(deltaTime) {
    // Update position based on WASD input
    this.updateMovement(deltaTime);

    // Update rotation based on mouse input
    this.updateRotation();

    // Update gaze direction based on rotation
    this.updateGaze();

    // Send position update to server
    this.network.sendPlayerUpdate(this.position, this.rotation, this.gaze);

    // Update camera
    this.scene.updateCamera(this.position, this.rotation);
  }

  /**
   * Update player position based on movement input (WASD)
   */
  updateMovement(deltaTime) {
    let moveX = 0;
    let moveZ = 0;

    // Forward/backward
    if (this.keys['w']) {
      moveZ += PLAYER_MOVEMENT_SPEED_FORWARD * deltaTime;
    }
    if (this.keys['s']) {
      moveZ -= PLAYER_MOVEMENT_SPEED_BACKWARD * deltaTime;
    }

    // Strafe left/right
    if (this.keys['a']) {
      moveX -= PLAYER_MOVEMENT_SPEED_STRAFE * deltaTime;
    }
    if (this.keys['d']) {
      moveX += PLAYER_MOVEMENT_SPEED_STRAFE * deltaTime;
    }

    // Apply rotation to movement (move in direction player is facing)
    const cosY = Math.cos(this.rotation.y);
    const sinY = Math.sin(this.rotation.y);

    this.position.x += moveX * cosY - moveZ * sinY;
    this.position.z += moveX * sinY + moveZ * cosY;

    // Keep player in arena bounds (simple circular boundary)
    const distFromCenter = Math.sqrt(
      this.position.x * this.position.x + this.position.z * this.position.z
    );
    const maxRadius = 90; // slightly inside arena wall

    if (distFromCenter > maxRadius) {
      const scale = maxRadius / distFromCenter;
      this.position.x *= scale;
      this.position.z *= scale;
    }

    // Clamp Y to ground level
    this.position.y = Math.max(1, this.position.y);
  }

  /**
   * Update rotation based on mouse movement
   */
  updateRotation() {
    // Convert mouse movement to camera rotation
    // Pitch (up/down look): rotation.x
    // Yaw (left/right look): rotation.y

    this.rotation.y -= this.mouseDelta.x * PLAYER_ROTATION_SPEED;
    this.rotation.x -= this.mouseDelta.y * PLAYER_ROTATION_SPEED;

    // Clamp pitch to prevent flipping over
    const maxPitch = Math.PI / 2 - 0.1;
    this.rotation.x = Math.max(-maxPitch, Math.min(maxPitch, this.rotation.x));

    // Wrap yaw around
    if (this.rotation.y > Math.PI) this.rotation.y -= 2 * Math.PI;
    if (this.rotation.y < -Math.PI) this.rotation.y += 2 * Math.PI;

    // Reset mouse delta
    this.mouseDelta.x = 0;
    this.mouseDelta.y = 0;
  }

  /**
   * Update gaze direction from rotation (forward-facing direction)
   * Used for monster blind spot calculations and signals
   */
  updateGaze() {
    // Calculate direction vector from pitch and yaw
    const cosX = Math.cos(this.rotation.x);
    const sinX = Math.sin(this.rotation.x);
    const cosY = Math.cos(this.rotation.y);
    const sinY = Math.sin(this.rotation.y);

    this.gaze.x = sinY * cosX;
    this.gaze.y = sinX;
    this.gaze.z = cosY * cosX;
  }

  /**
   * Set local player position (received from server)
   */
  setPosition(position) {
    // If we were corrected significantly, update local position
    // Only apply if correction is large (server disagreement)
    const dx = position.x - this.position.x;
    const dy = position.y - this.position.y;
    const dz = position.z - this.position.z;
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

    if (distance > 0.5) {
      // Large correction from server
      this.position = position;
    }
  }

  /**
   * Get current player state
   */
  getState() {
    return {
      position: { ...this.position },
      rotation: { ...this.rotation },
      gaze: { ...this.gaze },
    };
  }
}
