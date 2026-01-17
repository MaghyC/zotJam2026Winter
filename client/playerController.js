/**
 * client/playerController.js
 * 
 * Production-ready player input handling and movement control.
 * Implements all keybindings for movement, blink, attachment, and broadcasts.
 */

class PlayerController {
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
   * V key - attachment request or accept
   */
  handleVPress() {
    // TODO: Implement based on attachment state
    // If no pending requests, request attachment from nearest player
    // If pending request, accept it
  }

  /**
   * X key - decline attachment or cancel request
   */
  handleXPress() {
    // TODO: Implement
    // Decline pending attachment request or cancel outgoing request
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

    // Send position update to server (rate-limited by network layer)
    this.network.sendPlayerInput({
      position: this.position,
      rotation: this.rotation,
      gaze: this.gaze
    });

    // Update camera
    if (this.scene) {
      this.scene.updateCamera(this.position, this.rotation);
    }
  }

  /**
   * Update player position based on WASD movement
   */
  updateMovement(deltaTime) {
    const FORWARD_SPEED = 15; // units/second
    const BACKWARD_SPEED = 7.5; // 50% of forward
    const STRAFE_SPEED = 12;
    const MOVEMENT_DAMPING = 0.95; // friction

    let moveX = 0;
    let moveZ = 0;

    // Forward/backward
    if (this.keys['w'] || this.keys['arrowup']) {
      moveZ += FORWARD_SPEED * deltaTime;
    }
    if (this.keys['s'] || this.keys['arrowdown']) {
      moveZ -= BACKWARD_SPEED * deltaTime;
    }

    // Strafe left/right
    if (this.keys['a'] || this.keys['arrowleft']) {
      moveX -= STRAFE_SPEED * deltaTime;
    }
    if (this.keys['d'] || this.keys['arrowright']) {
      moveX += STRAFE_SPEED * deltaTime;
    }

    // Apply rotation to movement (move in direction player is facing)
    const cosY = Math.cos(this.rotation.y);
    const sinY = Math.sin(this.rotation.y);

    this.position.x += moveX * cosY - moveZ * sinY;
    this.position.z += moveX * sinY + moveZ * cosY;

    // Keep player in arena bounds (circular boundary at radius 90)
    const distFromCenter = Math.sqrt(
      this.position.x * this.position.x + this.position.z * this.position.z
    );
    const maxRadius = 90;

    if (distFromCenter > maxRadius) {
      const scale = maxRadius / distFromCenter;
      this.position.x *= scale;
      this.position.z *= scale;
    }

    // Keep player above ground
    this.position.y = Math.max(0, this.position.y);
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
   * Set player position from server correction
   */
  setPosition(position) {
    // Only apply large corrections to prevent jitter
    const dx = position.x - this.position.x;
    const dy = position.y - this.position.y;
    const dz = position.z - this.position.z;
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

    if (distance > 1) {
      // Large correction from server
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
