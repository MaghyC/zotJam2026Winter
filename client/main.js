/**
 * client/main.js
 * 
 * Main game client - orchestrates all game systems (network, input, rendering, UI).
 * Entry point for the browser application.
 */

class GameClient {
  constructor() {
    this.network = null;
    this.ui = null;
    this.scene = null;
    this.controller = null;

    this.localPlayer = null;
    this.gameState = null;

    this.lastFrameTime = Date.now();
    this.animationFrameId = null;
  }

  /**
   * Initialize the game
   */
  async init() {
    console.log('%c=== Multi-Lobby Blink Royale ===', 'color: #00ff00; font-size: 16px; font-weight: bold;');

    try {
      // Initialize UI
      this.ui = new UIManager();
      this.ui.showMessage('Initializing game...', 'normal');

      // Connect to server
      this.network = new NetworkManager();
      await this.network.connect('Player');

      console.log('Connected to server, waiting for game to start...');

      // Setup network callbacks
      this.setupNetworkCallbacks();

      // Wait for join response
      await new Promise((resolve) => {
        const onJoined = (data) => {
          this.network.off('joined_lobby', onJoined);
          this.onLobbyJoined(data);
          resolve();
        };
        this.network.on('joined_lobby', onJoined);
      });

      // Initialize Three.js scene
      this.scene = new GameScene(document.getElementById('gameContainer'));
      window.gameScene = this.scene;

      // Initialize player controller
      this.controller = new PlayerController(this.scene, this.network);

      // Hide loading screen
      this.ui.hideLoading();
      this.ui.showMessage('Game started! Use WASD to move, mouse to look', 'normal');

      // Start render loop
      this.startRenderLoop();

    } catch (error) {
      console.error('[Main] Init error:', error);
      this.ui.showMessage(`Error: ${error.message}`, 'error');
    }
  }

  /**
   * Setup network event callbacks
   */
  setupNetworkCallbacks() {
    this.network.on('state_update', (data) => {
      this.onStateUpdate(data);
    });

    this.network.on('match_start', (data) => {
      this.ui.showMessage('🎮 MATCH STARTED!', 'normal');
    });

    this.network.on('match_end', (data) => {
      this.onMatchEnd(data);
    });

    this.network.on('player_joined', (data) => {
      this.ui.showMessage(`${data.username} joined the game`, 'normal');
    });

    this.network.on('player_left', (data) => {
      this.ui.showMessage('A player left', 'warning');
    });

    this.network.on('orb_collected', (data) => {
      if (data.playerId === this.network.playerId) {
        this.ui.showMessage(`+${data.points} pts`, 'normal');
      }
    });

    this.network.on('blink_response', (data) => {
      if (!data.success) {
        const remaining = data.cooldownRemaining || 0;
        this.ui.showMessage(`Blink on cooldown: ${remaining.toFixed(1)}s`, 'warning');
      }
    });

    this.network.on('attach_request', (data) => {
      this.ui.showMessage(`${data.fromPlayerId} requests attachment (press V)`, 'normal');
    });

    this.network.on('attach_accepted', (data) => {
      this.ui.showMessage('Attachment accepted! 💙', 'normal');
    });

    this.network.on('attach_declined', (data) => {
      this.ui.showMessage('Attachment declined', 'warning');
    });

    this.network.on('disconnected', () => {
      this.ui.showMessage('Disconnected from server', 'error');
    });

    this.network.on('server_error', (data) => {
      this.ui.showMessage(`Server error: ${data.message}`, 'error');
    });
  }

  /**
   * Handle lobby join response
   */
  onLobbyJoined(data) {
    console.log('[Main] Joined lobby:', data.lobbyCode);
    this.ui.showMessage(`Joined lobby: ${data.lobbyCode}`, 'normal');
    document.getElementById('lobbyCodeValue').textContent = data.lobbyCode;
    document.getElementById('lobbyCode').style.display = 'block';
  }

  /**
   * Handle server state update
   */
  onStateUpdate(data) {
    if (!data) return;

    // Store game state
    this.gameState = data;

    // Find local player
    if (data.players && data.players.length > 0) {
      this.localPlayer = data.players.find(p => p.id === this.network.playerId);
    }

    // Update scene
    if (this.scene) {
      this.scene.updatePlayers(data.players || []);
      this.scene.updateMonsters(data.monsters || []);
      this.scene.updateOrbs(data.orbs || []);
      this.scene.updateArenaSafeRadius(data.arenaSafeRadius || 100);
    }

    // Update UI
    if (this.localPlayer && this.ui) {
      this.ui.updateHUD(this.localPlayer, data);

      // Calculate blink timer remaining
      const now = Date.now();
      const timeUntilBlink = Math.max(0, (this.localPlayer.blinkCooldownEnd - now) / 1000);
      this.ui.updateBlinkTimer(timeUntilBlink);

      // Draw minimap
      this.ui.drawMinimap(this.localPlayer, data, 100);
    }
  }

  /**
   * Handle match end
   */
  onMatchEnd(results) {
    console.log('[Main] Match ended:', results);
    this.ui.showMatchEnd(results);
    this.stopRenderLoop();
  }

  /**
   * Start the render loop
   */
  startRenderLoop() {
    const loop = () => {
      this.animationFrameId = requestAnimationFrame(loop);

      const now = Date.now();
      const deltaTime = Math.min((now - this.lastFrameTime) / 1000, 0.1); // Cap at 100ms
      this.lastFrameTime = now;

      // Update player controller
      if (this.controller) {
        this.controller.update(deltaTime);
      }

      // Render scene
      if (this.scene) {
        this.scene.render();
      }
    };

    this.animationFrameId = requestAnimationFrame(loop);
  }

  /**
   * Stop the render loop
   */
  stopRenderLoop() {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }
}

// Initialize on page load
window.addEventListener('DOMContentLoaded', async () => {
  const game = new GameClient();
  await game.init();
  window.gameClient = game;
});
