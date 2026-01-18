/**
 * server/index.js
 * 
 * Production-ready multiplayer server for Multi-Lobby Blink Royale.
 * 
 * Architecture:
 * - Express HTTP server for serving static files
 * - Socket.IO for real-time WebSocket communication
 * - Game loop that updates lobbies and broadcasts state
 * - Authoritative server-side validation of all game actions
 * 
 * Connection Flow:
 * 1. Player connects via WebSocket (ws://localhost:3000)
 * 2. Client sends JOIN_LOBBY request
 * 3. Server adds player to lobby and assigns MonsterAI
 * 4. Server broadcasts player positions/state at NETWORK_UPDATE_RATE
 * 5. On player input: validate server-side, update state, broadcast
 */

const express = require('express');
const { createServer } = require('http');
const { Server: SocketIOServer } = require('socket.io');
const path = require('path');

const { CONFIG, logger } = require('./config.js');
const { LobbyManager } = require('./lobbyManager.js');
const { MonsterAI } = require('./monsterAI.js');

// ==================== SETUP ====================
const app = express();
const httpServer = createServer(app);
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
  transports: ['websocket', 'polling'],
});

// Serve static files from /client
const clientPath = path.join(__dirname, '../client');
app.use(express.static(clientPath));
app.get('/', (req, res) => {
  res.sendFile(path.join(clientPath, 'index.html'));
});

// ==================== GAME STATE ====================
const lobbyManager = new LobbyManager(CONFIG.MAX_LOBBIES, CONFIG.PLAYERS_PER_LOBBY);
const monsterAIByLobby = new Map(); // lobbyId -> MonsterAI instance
const playerToLobby = new Map(); // playerId (socket.id) -> lobbyId
const playerReconnectTimers = new Map(); // playerId -> timeout id for reconnection grace period
const disconnectedPlayers = new Map(); // playerId -> { lobbyId, disconnectTime, timeout }
const playerSessions = new Map(); // username -> { playerId, lobbyId, lastActive }

// ==================== GAME LOOP ====================
let gameLoopRunning = false;
let gameLoopInterval = null;
const GAME_TICK_RATE = CONFIG.GAME_LOOP_RATE; // 60 Hz server updates
const NETWORK_TICK_RATE = CONFIG.NETWORK_UPDATE_RATE; // 30 Hz broadcasts to clients
const GAME_TICK = 1000 / GAME_TICK_RATE;
const NETWORK_TICK = 1000 / NETWORK_TICK_RATE;

let lastNetworkBroadcast = Date.now();
let gameTickCount = 0;

/**
 * Start the game loop - called when first player joins
 */
function startGameLoop() {
  if (gameLoopRunning) return;
  gameLoopRunning = true;
  logger.info('Game loop started');

  gameLoopInterval = setInterval(() => {
    gameTickCount++;
    const now = Date.now();

    // Update game state every game tick
    updateAllLobbies((GAME_TICK) / 1000);

    // Broadcast state to clients at network rate
    if (now - lastNetworkBroadcast >= NETWORK_TICK) {
      broadcastAllLobbies();
      lastNetworkBroadcast = now;
    }
  }, GAME_TICK);
}

/**
 * Stop the game loop - called when last player disconnects
 */
function stopGameLoop() {
  if (!gameLoopRunning) return;
  gameLoopRunning = false;
  clearInterval(gameLoopInterval);
  logger.info('Game loop stopped');
}

/**
 * Update all active lobbies (game logic tick)
 */

// index.js
function updateAllLobbies(deltaTime) {
  for (const [lobbyId, gameState] of lobbyManager.getAllLobbies()) {
    if (!gameState || !gameState.active) continue;

    const monsterAI = monsterAIByLobby.get(lobbyId);
    if (monsterAI) {
      monsterAI.updateAllMonsters(deltaTime);
    }

    const livingPlayers = gameState.getLivingPlayers();
    const now = Date.now();
    for (const player of livingPlayers) {
      // Regenerate health every configured interval (1% every 5s)
      if (!player.lastRegenTime || (now - player.lastRegenTime) >= CONFIG.PLAYER_REGEN_INTERVAL) {
        gameState.regenPlayer(player.id, CONFIG.PLAYER_REGEN_AMOUNT);
      }

      // Apply damage when outside the shrinking safe radius
      const dx = player.position.x - gameState.centerX;
      const dz = player.position.z - gameState.centerZ;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist > gameState.arenaSafeRadius) {
        const damagePerSecond = CONFIG.ARENA_OUTSIDE_DAMAGE_PER_SECOND || 5;
        const damage = damagePerSecond * deltaTime;
        gameState.damagePlayer(player.id, damage);
      }
    }

    const matchTime = gameState.getMatchElapsedTime();
    if (matchTime > CONFIG.ARENA_SHRINK_START_TIME) {
      const timeShrinking = matchTime - CONFIG.ARENA_SHRINK_START_TIME;
      const shrinkProgress = Math.min(1, timeShrinking / CONFIG.ARENA_SHRINK_DURATION);
      gameState.arenaSafeRadius =
        CONFIG.ARENA_RADIUS -
        (CONFIG.ARENA_RADIUS - CONFIG.ARENA_FINAL_RADIUS) * shrinkProgress;
    }

    const shouldEnd =
      livingPlayers.length <= 1 ||
      gameState.arenaSafeRadius <= CONFIG.ARENA_FINAL_RADIUS;
    if (shouldEnd && gameState.active) {
      endLobbyMatch(lobbyId);
    }
  }
}


/**
 * Broadcast lobby state to all clients
 */
function broadcastAllLobbies() {
  for (const [, gameState] of lobbyManager.getAllLobbies()) {
    // Broadcast for both lobby phase (inactive) and game phase (active)
    broadcastLobbyState(gameState);
  }
}


/**
 * Send current lobby state to all players in that lobby
 */
function broadcastLobbyState(gameState) {
  const players = Array.from(gameState.players.values()).map(p => ({
    id: p.id,
    username: p.username,
    position: p.position,
    rotation: p.rotation,
    gaze: p.gaze,
    health: p.health,
    maxHealth: p.maxHealth,
    score: p.score,
    state: p.state,
    attachedTo: p.attachedTo,
    ready: p.ready,
    attachmentState: p.attachmentState,

  }));

  const monsters = Array.from(gameState.monsters.values()).map(m => ({
    id: m.id,
    position: m.position,
    rotation: m.rotation,
    state: m.state,
    health: m.health,
    spawnTime: m.spawnTime,
    frozenBy: m.frozenBy || [],
  }));

  const orbs = Array.from(gameState.getActiveOrbs()).map(o => ({
    id: o.id,
    position: o.position,
    value: o.value,
  }));

  const payload = {
    players,
    monsters,
    orbs,
    arenaSafeRadius: gameState.arenaSafeRadius,
    matchTime: gameState.getMatchElapsedTime() / 1000, // seconds
    active: gameState.active, // Include whether game is active or in lobby
  };

  io.to(gameState.lobbyId).emit('state_update', payload);
}

/**
 * End a match in a lobby and announce results
 */
function endLobbyMatch(lobbyId) {
  const results = lobbyManager.endLobbyMatch(lobbyId);
  if (results) {
    io.to(lobbyId).emit('match_end', results);
    logger.info(`Match ended in lobby ${lobbyId}`, results);
  }
}

// ==================== SOCKET.IO HANDLERS ====================

io.on('connection', (socket) => {
  logger.debug(`Player connected: ${socket.id}`);

  let lobbyId = null;
  let playerId = socket.id;
  let actualPlayerId = playerId; // Track the actual persistent player ID

  /**
   * join_lobby - Player requests to join or create a lobby
   */
  socket.on('join_lobby', (data) => {
    const previousPlayerId = data.previousPlayerId;
    const username = data.username || `Player${playerId.slice(-4)}`;

    logger.info(`Join lobby request: ${playerId}`, { username, previousPlayerId });

    // Check if player is reconnecting with a stored ID
    let isReconnect = false;
    let targetLobbyId = null;

    if (previousPlayerId && disconnectedPlayers.has(previousPlayerId)) {
      const disconnected = disconnectedPlayers.get(previousPlayerId);
      const timeSinceDisconnect = Date.now() - disconnected.disconnectTime;

      if (timeSinceDisconnect < CONFIG.RECONNECT_GRACE_PERIOD) {
        // Player is reconnecting within grace period
        isReconnect = true;
        targetLobbyId = disconnected.lobbyId;
        actualPlayerId = previousPlayerId; // Use the stored player ID
        playerId = previousPlayerId; // Update playerId for this session

        clearTimeout(disconnected.timeout);
        disconnectedPlayers.delete(previousPlayerId);

        logger.info(`Player ${playerId} reconnecting to lobby ${targetLobbyId}`);
        socket.emit('reconnected', {
          playerId: actualPlayerId,
          message: `Welcome back, ${username}!`
        });
      }
    }

    // If not reconnecting, create new player ID or find new lobby
    if (!isReconnect) {
      actualPlayerId = socket.id; // New player gets socket ID
      targetLobbyId = data.lobbyCode ? data.lobbyCode : lobbyManager.findAvailableLobby();

      if (!targetLobbyId) {
        socket.emit('error', { message: 'No lobbies available' });
        logger.warn(`Join lobby failed for ${playerId}: no lobbies available`);
        return;
      }
    }

    // Add/rejoin player to lobby
    const playerData = {
      username: username,
    };

    const success = isReconnect ?
      true : // Already in lobby, just reconnecting socket
      lobbyManager.addPlayerToLobby(targetLobbyId, actualPlayerId, playerData);

    if (!success && !isReconnect) {
      socket.emit('error', { message: 'Failed to join lobby' });
      logger.warn(`Join lobby failed for ${actualPlayerId}: could not add to lobby`);
      return;
    }

    // Setup socket rooms
    lobbyId = targetLobbyId;
    playerId = actualPlayerId;
    playerToLobby.set(actualPlayerId, lobbyId);
    socket.join(lobbyId);

    const gameState = lobbyManager.getLobby(lobbyId);

    // Create MonsterAI if needed
    if (!monsterAIByLobby.has(lobbyId)) {
      const monsterAI = new MonsterAI(gameState);
      monsterAIByLobby.set(lobbyId, monsterAI);
    }

    // Check if we should start the game (simple: start when enough players or after delay)
    const playerCount = gameState.players.size;
    if (!gameState.active && playerCount >= 1) {
      // Auto-start after 5s or when 8 players join
      if (playerCount === CONFIG.PLAYERS_PER_LOBBY ||
        (playerCount >= 2 && !gameState._startTimeout)) {
        if (playerCount === CONFIG.PLAYERS_PER_LOBBY) {
          lobbyManager.startLobbyMatch(lobbyId);
          if (!gameLoopRunning) startGameLoop();
        } else {
          gameState._startTimeout = setTimeout(() => {
            if (!gameState.active && gameState.players.size > 0) {
              lobbyManager.startLobbyMatch(lobbyId);
              if (!gameLoopRunning) startGameLoop();
            }
          }, 5000);
        }
      }
    }

    // Send confirmation
    socket.emit('join_lobby_response', {
      success: true,
      lobbyCode: lobbyId,
      playerId: actualPlayerId,
      isReconnect,
      gameState: {
        players: Array.from(gameState.players.values()).map(p => ({
          id: p.id,
          username: p.username,
          position: p.position,
          health: p.health,
          maxHealth: p.maxHealth,
          score: p.score,
        })),
        orbs: Array.from(gameState.getActiveOrbs()).map(o => ({
          id: o.id,
          position: o.position,
        })),
        active: gameState.active,
      },
    });

    // Notify others
    if (!isReconnect) {
      socket.to(lobbyId).emit('player_joined', {
        playerId,
        username: username,
      });
    } else {
      socket.to(lobbyId).emit('player_reconnected', {
        playerId,
        username: username,
      });
    }

    logger.info(`Player ${playerId} ${isReconnect ? 'reconnected to' : 'joined'} lobby ${lobbyId} (${gameState.players.size}/${CONFIG.PLAYERS_PER_LOBBY})`);
  });

  /**
   * player_input - Receive player movement/rotation/gaze updates
   */
  socket.on('player_input', (data) => {
    if (!lobbyId) return;

    const gameState = lobbyManager.getLobby(lobbyId);
    if (!gameState || !gameState.active) return;

    gameState.updatePlayerTransform(playerId, data.position, data.rotation, data.gaze);
  });

  /**
   * blink_action - Player attempts to blink
   */
  socket.on("blink_action", (data) => {
    if (!lobbyId) return;

    const gameState = lobbyManager.getLobby(lobbyId);
    if (!gameState || !gameState.active) return;

    gameState.executeBlink(playerId, CONFIG.PLAYER_BLINK_MAX_TIME / 1000);
    socket.to(lobbyId).emit("blink_action", { playerId });
    socket.emit("blink_response", { success: true });

  });

  /**
   * collect_orb - Player collects an orb
   */
  socket.on('collect_orb', (data) => {
    if (!lobbyId) return;

    const gameState = lobbyManager.getLobby(lobbyId);
    if (!gameState) return;

    const points = gameState.collectOrb(data.orbId, playerId);
    if (points > 0) {
      io.to(lobbyId).emit('orb_collected', {
        orbId: data.orbId,
        playerId,
        points,
      });
      logger.debug(`Player ${playerId} collected orb ${data.orbId} (+${points})`);
    }
  });

  /**
   * attach_request - Player requests to attach with another player
   */
  socket.on('attach_request', (data) => {
    if (!lobbyId) return;

    const gameState = lobbyManager.getLobby(lobbyId);
    if (!gameState) return;

    const success = gameState.requestAttachment(playerId, data.targetPlayerId);
    if (success) {
      io.to(lobbyId).emit('attach_request', {
        fromPlayerId: playerId,
        toPlayerId: data.targetPlayerId,
      });
    }
  });

  /**
   * attach_response - Player accepts/declines attachment
   */
  socket.on('attach_response', (data) => {
    if (!lobbyId) return;

    const gameState = lobbyManager.getLobby(lobbyId);
    if (!gameState) return;

    if (data.accepted) {
      gameState.acceptAttachment(playerId, data.fromPlayerId);
      io.to(lobbyId).emit('attach_accepted', {
        player1: playerId,
        player2: data.fromPlayerId,
      });
    } else {
      gameState.declineAttachment(playerId, data.fromPlayerId);
      io.to(data.fromPlayerId).emit('attach_declined', {
        byPlayerId: playerId,
      });
    }
  });

  /**
   * detach - Player detaches from partner (double-press required)
   */
  socket.on('detach', (data) => {
    if (!lobbyId) return;

    const gameState = lobbyManager.getLobby(lobbyId);
    if (!gameState) return;

    gameState.detachPlayers(playerId);
    io.to(lobbyId).emit('player_detached', { playerId });
  });

  /**
   * set_ready - Player sets their ready status
   */
  socket.on('set_ready', (data) => {
    if (!lobbyId) return;

    const gameState = lobbyManager.getLobby(lobbyId);
    if (!gameState || gameState.active) return; // Can't ready up after game starts

    // Require at least 2 players to start
    if (gameState.players.size < 2) {
      socket.emit('game_message', {
        message: 'Need at least 2 players to start',
        type: 'warning'
      });
      return;
    }

    gameState.setPlayerReady(playerId, data.ready || false);
    logger.debug(`Player ${playerId} ready status: ${data.ready}`);

    // Check if all players are ready and auto-start if so
    if (gameState.areAllPlayersReady() && gameState.players.size >= 2) {
      logger.info(`Lobby ${lobbyId}: All players ready! Starting match...`);
      gameState.startMatch();
      io.to(lobbyId).emit('match_started', {
        message: 'All players ready! Match starting now!',
      });
    }
  });

  /**
   * broadcast_timer - Player broadcasts their blink timer to nearby pairs
   */
  socket.on('broadcast_timer', (data) => {
    if (!lobbyId) return;

    const gameState = lobbyManager.getLobby(lobbyId);
    if (!gameState) return;

    const nearby = gameState.getNearbyPlayers(playerId, CONFIG.PAIR_BROADCAST_RANGE);
    const remainingMs = CONFIG.PLAYER_BLINK_MAX_TIME - (Date.now() - gameState.getPlayer(playerId).lastAutoBlinkTime);
    let remaining = remainingMs / 1000;

    for (const nearbyPlayer of nearby) {
      io.to(nearbyPlayer.id).emit('timer_broadcast', {
        fromPlayerId: playerId,
        timerRemaining: remaining,
      });
    }
  });

  /**
   * disconnect - Player left the game
   * Allows reconnection for a grace period
   */
  socket.on('disconnect', () => {
    logger.info(`Player disconnected: ${playerId} from lobby ${lobbyId}`);

    if (lobbyId) {
      const gameState = lobbyManager.getLobby(lobbyId);
      if (gameState) {
        // Mark player as disconnected instead of removing
        const player = gameState.getPlayer(playerId);
        if (player) {
          player.isConnected = false;
          player.disconnectTime = Date.now();

          // Store disconnected player info for reconnection
          disconnectedPlayers.set(playerId, {
            lobbyId: lobbyId,
            disconnectTime: Date.now(),
            playerId: playerId,
            username: player.username
          });

          // Notify other players that this player disconnected
          io.to(lobbyId).emit('player_disconnected', { playerId });

          // Set timeout to permanently remove player if they don't reconnect
          const reconnectTimer = setTimeout(() => {
            const gameState = lobbyManager.getLobby(lobbyId);
            if (gameState) {
              const player = gameState.getPlayer(playerId);
              if (player && !player.isConnected) {
                // Player still disconnected after grace period - remove them
                lobbyManager.removePlayerFromLobby(playerId);
                disconnectedPlayers.delete(playerId);
                io.to(lobbyId).emit('player_left', { playerId });
                logger.info(`Player permanently removed after reconnect timeout: ${playerId}`);
              }
            }
          }, CONFIG.RECONNECT_GRACE_PERIOD);

          // Store the timer so we can clear it if they reconnect
          playerReconnectTimers.set(playerId, reconnectTimer);

          // Also store in disconnectedPlayers map
          const entry = disconnectedPlayers.get(playerId);
          if (entry) {
            entry.timeout = reconnectTimer;
          }
        }
      }
      // Don't delete from playerToLobby yet - they might reconnect
    }

    // Stop game loop if no more active lobbies
    const hasActivePlayers = Array.from(playerToLobby.values()).some(lid => lid === lobbyId);
    if (!hasActivePlayers && lobbyManager.getLobby(lobbyId)?.players.size === 0) {
      stopGameLoop();
    }
  });

  /**
   * reconnect - Player reconnecting after temporary disconnect
   * Re-associates the socket with the player's existing state
   */
  socket.on('reconnect', ({ playerId: reconnectPlayerId }) => {
    logger.info(`Player attempting to reconnect: ${reconnectPlayerId}`);

    const existingLobbyId = playerToLobby.get(reconnectPlayerId);
    if (!existingLobbyId) {
      logger.warn(`Reconnect failed: No lobby found for player ${reconnectPlayerId}`);
      socket.emit('reconnect_failed', { reason: 'No active session found' });
      return;
    }

    const gameState = lobbyManager.getLobby(existingLobbyId);
    if (!gameState) {
      logger.warn(`Reconnect failed: Lobby ${existingLobbyId} not found`);
      socket.emit('reconnect_failed', { reason: 'Lobby no longer exists' });
      playerToLobby.delete(reconnectPlayerId);
      return;
    }

    const player = gameState.getPlayer(reconnectPlayerId);
    if (!player) {
      logger.warn(`Reconnect failed: Player ${reconnectPlayerId} not found in lobby`);
      socket.emit('reconnect_failed', { reason: 'Player not found in lobby' });
      playerToLobby.delete(reconnectPlayerId);
      return;
    }

    // Clear the reconnect timeout
    const timer = playerReconnectTimers.get(reconnectPlayerId);
    if (timer) {
      clearTimeout(timer);
      playerReconnectTimers.delete(reconnectPlayerId);
    }

    // Restore player connection
    player.isConnected = true;
    player.socketId = socket.id;
    playerId = reconnectPlayerId;
    lobbyId = existingLobbyId;

    logger.info(`Player successfully reconnected: ${reconnectPlayerId} in lobby ${existingLobbyId}`);

    // Notify other players that this player reconnected
    io.to(existingLobbyId).emit('player_reconnected', {
      playerId: reconnectPlayerId,
      playerData: player
    });

    socket.emit('reconnect_success', {
      lobbyId: existingLobbyId,
      playerData: player
    });
  });
});

// ==================== ADMIN ENDPOINTS ====================
app.get('/admin/stats', (req, res) => {
  const stats = {
    lobbies: lobbyManager.getLobbiesStats(),
    activeConnections: io.engine.clientsCount,
    gameLoopRunning,
    timestamp: new Date().toISOString(),
  };
  res.json(stats);
});

app.get('/admin/lobbies', (req, res) => {
  const lobbies = Array.from(lobbyManager.getAllLobbies()).map(gs => ({
    code: gs.lobbyId,
    players: Array.from(gs.players.values()).map(p => ({
      id: p.id,
      username: p.username,
      health: p.health,
      score: p.score,
      state: p.state,
    })),
    monsters: gs.monsters.size,
    orbs: gs.getActiveOrbs().length,
    active: gs.active,
  }));
  res.json(lobbies);
});

// ==================== STARTUP ====================
const PORT = process.env.PORT || CONFIG.PORT;
const HOST = process.env.HOST || CONFIG.HOST;

httpServer.listen(PORT, HOST, () => {
  logger.info(`========================================`);
  logger.info(`Multi-Lobby Blink Royale Server`);
  logger.info(`========================================`);
  logger.info(`Server running on ws://${HOST}:${PORT}`);
  logger.info(`Web UI: http://${HOST}:${PORT}`);
  logger.info(`Admin stats: http://${HOST}:${PORT}/admin/stats`);
  logger.info(`Admin lobbies: http://${HOST}:${PORT}/admin/lobbies`);
  logger.info(`Waiting for players...`);
});

// 已有的变量：io, httpServer, stopGameLoop, logger

let isShuttingDown = false;

process.on('SIGINT', async () => {
  if (isShuttingDown) return;   // 防止重复进入
  isShuttingDown = true;

  logger.info('Shutting down......');
  stopGameLoop();
  logger.info('Game loop stopped.');

  try {
    // 2. 主动断开所有 Socket.IO 客户端
    await new Promise((resolve) => {
      io.close(() => {
        logger.info('All Socket.IO clients disconnected');
        resolve();
      });
    });

    await new Promise((resolve) => {
      httpServer.close(() => {
        logger.info('HTTP server closed');
        resolve();
      });
    });


    logger.info('Server stopped cleanly');
    process.exit(0);
  } catch (err) {
    logger.error('Error during shutdown', { err });
    // 避免挂死，出错也强制退出
    process.exit(1);
  }
});



module.exports = { io, lobbyManager, monsterAIByLobby };
