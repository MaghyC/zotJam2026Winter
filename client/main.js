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

    // Player identity
    this.playerId = null;
    this.username = null;

    // Track collected orbs to avoid duplicate collection attempts
    this.collectedOrbIds = new Set();
  }

  /**
   * Initialize the game - first try to restore session, then show login
   */
  async init() {
    console.log('%c=== Multi-Lobby Blink Royale ===', 'color: #00ff00; font-size: 16px; font-weight: bold;');

    try {
      // Try to restore previous session
      const savedSession = this.loadPlayerSession();

      if (savedSession) {
        console.log('[Main] Restoring previous session:', savedSession.username);
        this.username = savedSession.username;
        this.playerId = savedSession.playerId;
        await this.startGame();
      } else {
        // Show login screen
        this.showLoginScreen();
      }
    } catch (error) {
      console.error('[Main] Init error:', error);
      this.showLoginScreen();
    }
  }

  /**
   * Load player session from localStorage
   */
  loadPlayerSession() {
    const stored = localStorage.getItem('playerSession');
    if (!stored) return null;

    try {
      return JSON.parse(stored);
    } catch {
      localStorage.removeItem('playerSession');
      return null;
    }
  }

  /**
   * Save player session to localStorage
   */
  savePlayerSession() {
    const session = {
      username: this.username,
      playerId: this.playerId,
      timestamp: Date.now()
    };
    localStorage.setItem('playerSession', JSON.stringify(session));
  }

  /**
   * Show login screen
   */
  showLoginScreen() {
    const loginScreen = document.getElementById('loginScreen');
    const usernameInput = document.getElementById('usernameInput');
    const loginBtn = document.getElementById('loginBtn');

    loginScreen.classList.add('show');
    loginScreen.style.display = 'flex';

    // Check if we have a stored player ID - if so, suggest the last username
    const savedUsername = localStorage.getItem('lastUsername');
    if (savedUsername) {
      usernameInput.value = savedUsername;
      usernameInput.select();
    } else {
      usernameInput.focus();
    }

    // Handle login button click
    loginBtn.onclick = () => {
      const username = usernameInput.value.trim();
      if (!username) {
        alert('Please enter a username');
        usernameInput.focus();
        return;
      }

      if (username.length < 2) {
        alert('Username must be at least 2 characters');
        usernameInput.focus();
        return;
      }

      loginBtn.disabled = true;
      this.username = username;
      localStorage.setItem('lastUsername', username);
      this.startGame();
    };

    // Handle Enter key
    usernameInput.onkeypress = (e) => {
      if (e.key === 'Enter') {
        loginBtn.click();
      }
    };
  }

  /**
   * Hide login screen
   */
  hideLoginScreen() {
    const loginScreen = document.getElementById('loginScreen');
    loginScreen.classList.remove('show');
    loginScreen.style.display = 'none';
  }

  /**
   * Start the game after login
   */
  async startGame() {
    console.log('[Main] Starting game for player:', this.username);

    try {
      this.hideLoginScreen();

      // Show loading screen during connection
      const loadingScreen = document.getElementById('loadingScreen');
      loadingScreen.classList.add('show');

      // Initialize UI
      this.ui = new UIManager();
      this.ui.showMessage('Connecting to server...', 'normal');

      // Connect to server with username and playerId if reconnecting
      this.network = new NetworkManager();

      // Try to reconnect if we have a stored player ID
      const storedPlayerId = localStorage.getItem('playerId');
      if (storedPlayerId && !this.playerId) {
        this.playerId = storedPlayerId;
      }

      // Setup network callbacks BEFORE connecting
      this.setupNetworkCallbacks();

      // Connect and wait for join response
      const joinData = await this.network.connect(this.username, this.playerId);

      // Store the received player ID
      this.playerId = this.network.playerId;
      localStorage.setItem('playerId', this.playerId);
      this.savePlayerSession();

      console.log('[Main] Connected with ID:', this.playerId);

      // Handle lobby join
      this.onLobbyJoined(joinData);

      // Initialize Three.js scene
      this.scene = new GameScene(document.getElementById('gameContainer'));
      window.gameScene = this.scene;

      // Initialize player controller
      this.controller = new PlayerController(this.scene, this.network);

      // Hide loading screen and show game
      loadingScreen.classList.remove('show');
      this.ui.showMessage(`Welcome ${this.username}! Use WASD to move, mouse to look`, 'normal');

      // Start render loop
      this.startRenderLoop();

    } catch (error) {
      console.error('[Main] Start game error:', error);
      this.ui.showMessage(`Error: ${error.message}`, 'error');

      // Show login screen again on error
      setTimeout(() => {
        this.showLoginScreen();
      }, 2000);
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

    // Clean up collected orbs set (remove orbs that are no longer in the game)
    const activeOrbIds = new Set((data.orbs || []).map(o => o.id));
    for (const orbId of this.collectedOrbIds) {
      if (!activeOrbIds.has(orbId)) {
        this.collectedOrbIds.delete(orbId);
      }
    }

    // Check and collect nearby orbs
    this.checkOrbCollection(data.orbs || []);

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
   * Check if player is close to any orbs and collect them
   * ORB_COLLECTION_RADIUS: 2.5 units (generous for easier collection)
   */
  checkOrbCollection(orbs) {
    if (!this.controller || !Array.isArray(orbs)) return;

    const ORB_COLLECTION_RADIUS = 2.5; // Generous radius for collection
    const playerPos = this.controller.position;

    for (const orb of orbs) {
      // Skip if already collected or already attempted
      if (orb.collected || this.collectedOrbIds.has(orb.id)) continue;

      // Calculate distance to orb
      const dx = orb.position.x - playerPos.x;
      const dy = orb.position.y - playerPos.y;
      const dz = orb.position.z - playerPos.z;
      const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

      // If close enough, collect it
      if (distance <= ORB_COLLECTION_RADIUS) {
        this.collectedOrbIds.add(orb.id);
        this.network.sendCollectOrb(orb.id);
        console.log('[Main] Orb collected:', orb.id, 'distance:', distance.toFixed(2));
      }
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
