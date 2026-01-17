/**
 * client/main.js
 * 
 * Main entry point for the game client.
 * 
 * Responsibilities:
 * 1. Initialize all systems (network, scene, UI, controller)
 * 2. Set up the game loop
 * 3. Coordinate between systems
 * 4. Handle game lifecycle (connecting, playing, disconnecting)
 */

import { NetworkManager } from './network.js';
import { Scene } from './scene.js';
import { PlayerController } from './playerController.js';
import { UI } from './ui.js';
import { MESSAGE_TYPES } from '../shared/constants.js';

class Game {
  constructor() {
    this.network = null;
    this.scene = null;
    this.controller = null;
    this.ui = null;

    // Game state
    this.isRunning = false;
    this.localPlayerId = null;
    this.serverGameState = null;
    this.lastFrameTime = Date.now();
  }

  /**
   * Initialize and start the game
   */
  async initialize() {
    try {
      this.ui = new UI();
      this.ui.showLoading('Initializing game...');

      // Initialize scene and graphics
      this.ui.showLoading('Loading 3D scene...');
      const canvas = document.getElementById('canvas');
      this.scene = new Scene();
      this.scene.initialize(canvas);

      // Initialize networking
      this.ui.showLoading('Connecting to server...');
      this.network = new NetworkManager();
      
      // Get server URL from environment or default
      const serverUrl = window.location.origin;
      
      const lobbyData = await this.network.connect('Player');
      this.localPlayerId = lobbyData.playerId;

      this.ui.hideLoading();

      // Initialize controller
      this.controller = new PlayerController(this.scene, this.network);

      // Initialize player mesh
      const initialPos = { x: 0, y: 1, z: 0 };
      this.scene.createPlayerMesh(this.localPlayerId, initialPos);

      // Set up network event listeners
      this.setupNetworkListeners();

      // Start game loop
      this.isRunning = true;
      this.gameLoop();

      console.log('Game initialized successfully');
    } catch (error) {
      console.error('Failed to initialize game:', error);
      this.ui.showMessage('Failed to connect to server: ' + error.message);
    }
  }

  /**
   * Set up event listeners for network messages
   */
  setupNetworkListeners() {
    // Receive lobby state updates (position, monster, orb updates)
    this.network.on(MESSAGE_TYPES.LOBBY_STATE, (data) => {
      this.handleLobbyStateUpdate(data);
    });

    // Blink action from other players
    this.network.on(MESSAGE_TYPES.BLINK_ACTION, (data) => {
      if (data.playerId !== this.localPlayerId) {
        this.ui.showMessage(`${data.playerId} blinked!`);
      }
    });

    // Orb collected
    this.network.on(MESSAGE_TYPES.ORB_COLLECTED, (data) => {
      if (data.orbId) {
        this.scene.removeOrbMesh(data.orbId);
      }
      if (data.playerId !== this.localPlayerId) {
        this.ui.showMessage(`${data.playerId} collected an orb!`);
      }
    });

    // Blink timer broadcast
    this.network.on(MESSAGE_TYPES.BLINK_TIMER_BROADCAST, (data) => {
      const remaining = data.blinkTimerRemaining.toFixed(1);
      this.ui.addBroadcast(`${data.from}: Blink ready in ${remaining}s`);
    });

    // Monster attack
    this.network.on(MESSAGE_TYPES.MONSTER_ATTACK, (data) => {
      if (data.targetId === this.localPlayerId) {
        this.ui.showMessage('Monster attacked! Health reduced!', 2);
      }
    });

    // Attachment events
    this.network.on(MESSAGE_TYPES.ATTACH_REQUEST, (data) => {
      if (data.to === this.localPlayerId) {
        console.log(`Attachment request from ${data.from}`);
        // TODO: Show UI for accepting/declining
      }
    });

    this.network.on(MESSAGE_TYPES.ATTACH_RESPONSE, (data) => {
      if (data.to === this.localPlayerId && data.accepted) {
        this.ui.updateAttachmentStatus('Attached');
        this.ui.showMessage('Successfully attached!');
      }
    });
  }

  /**
   * Handle lobby state update from server
   */
  handleLobbyStateUpdate(data) {
    this.serverGameState = data;

    // Update other players
    if (data.players) {
      for (const playerData of data.players) {
        if (playerData.id === this.localPlayerId) {
          // Update HUD with local player data
          this.ui.updateHUD({
            health: playerData.health,
            maxHealth: 100,
            score: playerData.score,
          });
          continue;
        }

        // Update other player meshes
        if (!this.scene.playerMeshes.has(playerData.id)) {
          this.scene.createPlayerMesh(playerData.id, playerData.position);
        } else {
          this.scene.updatePlayerMesh(playerData.id, playerData.position, playerData.rotation);
        }
      }
    }

    // Update monsters
    if (data.monsters) {
      for (const monsterData of data.monsters) {
        if (!this.scene.monsterMeshes.has(monsterData.id)) {
          this.scene.createMonsterMesh(monsterData.id, monsterData.position);
        } else {
          this.scene.updateMonsterMesh(monsterData.id, monsterData.position);
        }
      }
    }

    // Update minimap
    const playerState = this.controller.getState();
    this.ui.drawMinimap(playerState.position, playerState.rotation, data);
  }

  /**
   * Main game loop
   */
  gameLoop() {
    // Calculate delta time
    const now = Date.now();
    const deltaTime = (now - this.lastFrameTime) / 1000;
    this.lastFrameTime = now;

    // Update player controller
    this.controller.update(deltaTime);

    // Update blink timer display
    // TODO: Get blink timer from server state
    // this.ui.updateBlinkTimer(blinkRemaining);

    // Render scene
    this.scene.render();

    // Continue loop
    if (this.isRunning) {
      requestAnimationFrame(() => this.gameLoop());
    }
  }
}

// Initialize game when page loads
window.addEventListener('DOMContentLoaded', () => {
  const game = new Game();
  game.initialize();
});

// Handle page unload
window.addEventListener('beforeunload', () => {
  console.log('Closing game...');
});
