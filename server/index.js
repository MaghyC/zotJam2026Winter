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
function updateAllLobbies(deltaTime) {
  for (const [lobbyId, gameState] of lobbyManager.getAllLobbies().entries ?
    lobbyManager.getAllLobbies().entries() :
    lobbyManager.getAllLobbies().map(gs => [gs.lobbyId, gs])) {

    if (!gameState || !gameState.active) continue;

    // Update monsters
    const monsterAI = monsterAIByLobby.get(lobbyId);
    if (monsterAI) {
      monsterAI.updateAllMonsters(deltaTime);
    }

    // Regenerate player health
    const livingPlayers = gameState.getLivingPlayers();
    for (const player of livingPlayers) {
      gameState.regenPlayer(player.id, CONFIG.PLAYER_REGEN_AMOUNT);
    }

    // Update arena shrinking (simple linear shrink after initial delay)
    const matchTime = gameState.getMatchElapsedTime();
    if (matchTime > CONFIG.ARENA_SHRINK_START_TIME) {
      const timeShrinking = matchTime - CONFIG.ARENA_SHRINK_START_TIME;
      const shrinkProgress = Math.min(1, timeShrinking / CONFIG.ARENA_SHRINK_DURATION);
      gameState.arenaSafeRadius = CONFIG.ARENA_RADIUS -
        (CONFIG.ARENA_RADIUS - CONFIG.ARENA_FINAL_RADIUS) * shrinkProgress;
    }

    // Check if match should end
    const shouldEnd = livingPlayers.length <= 1 || gameState.arenaSafeRadius <= CONFIG.ARENA_FINAL_RADIUS;
    if (shouldEnd && gameState.active) {
      endLobbyMatch(lobbyId);
    }
  }
}

/**
 * Broadcast lobby state to all clients
 */
function broadcastAllLobbies() {
  const lobbies = Array.isArray(lobbyManager.getAllLobbies()) ?
    lobbyManager.getAllLobbies() :
    Array.from(lobbyManager.getAllLobbies());

  for (const gameState of lobbies) {
    if (!gameState.active) continue;
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
  }));

  const monsters = Array.from(gameState.monsters.values()).map(m => ({
    id: m.id,
    position: m.position,
    rotation: m.rotation,
    state: m.state,
    health: m.health,
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

  /**
   * join_lobby - Player requests to join or create a lobby
   */
  socket.on('join_lobby', (data) => {
    logger.info(`Join lobby request: ${playerId}`, data);

    // Find lobby (by code or random available)
    let targetLobbyId = data.lobbyCode ? data.lobbyCode : lobbyManager.findAvailableLobby();

    if (!targetLobbyId) {
      socket.emit('error', { message: 'No lobbies available' });
      logger.warn(`Join lobby failed for ${playerId}: no lobbies available`);
      return;
    }

    // Add player to lobby
    const playerData = {
      username: data.username || `Player${playerId.slice(-4)}`,
    };

    const success = lobbyManager.addPlayerToLobby(targetLobbyId, playerId, playerData);

    if (!success) {
      socket.emit('error', { message: 'Failed to join lobby' });
      logger.warn(`Join lobby failed for ${playerId}: could not add to lobby`);
      return;
    }

    // Setup socket rooms
    lobbyId = targetLobbyId;
    playerToLobby.set(playerId, lobbyId);
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
      playerId,
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
    socket.to(lobbyId).emit('player_joined', {
      playerId,
      username: playerData.username,
    });

    logger.info(`Player ${playerId} joined lobby ${lobbyId} (${gameState.players.size}/${CONFIG.PLAYERS_PER_LOBBY})`);
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
  socket.on('blink_action', (data) => {
    if (!lobbyId) return;

    const gameState = lobbyManager.getLobby(lobbyId);
    if (!gameState) return;

    const canBlink = gameState.canBlink(playerId);
    if (canBlink) {
      gameState.executeBlink(playerId, CONFIG.PLAYER_BLINK_MAX_TIME / 1000);

      // Broadcast blink to others
      socket.to(lobbyId).emit('blink_action', { playerId });

      socket.emit('blink_response', { success: true });
    } else {
      const remaining = gameState.getBlinkCooldownRemaining(playerId);
      socket.emit('blink_response', {
        success: false,
        cooldownRemaining: remaining,
      });
    }
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
   * broadcast_timer - Player broadcasts their blink timer to nearby pairs
   */
  socket.on('broadcast_timer', (data) => {
    if (!lobbyId) return;

    const gameState = lobbyManager.getLobby(lobbyId);
    if (!gameState) return;

    const nearby = gameState.getNearbyPlayers(playerId, CONFIG.PAIR_BROADCAST_RANGE);
    const remaining = gameState.getBlinkCooldownRemaining(playerId);

    for (const nearbyPlayer of nearby) {
      io.to(nearbyPlayer.id).emit('timer_broadcast', {
        fromPlayerId: playerId,
        timerRemaining: remaining,
      });
    }
  });

  /**
   * disconnect - Player left the game
   */
  socket.on('disconnect', () => {
    logger.info(`Player disconnected: ${playerId}`);

    if (lobbyId) {
      lobbyManager.removePlayerFromLobby(playerId);
      playerToLobby.delete(playerId);

      io.to(lobbyId).emit('player_left', { playerId });

      // Stop game loop if no more active lobbies
      const hasActivePlayers = Array.from(playerToLobby.values()).some(lid => lid === lobbyId);
      if (!hasActivePlayers && lobbyManager.getLobby(lobbyId)?.players.size === 0) {
        stopGameLoop();
      }
    }
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

process.on('SIGINT', () => {
  logger.info('Shutting down...');
  stopGameLoop();
  httpServer.close(() => {
    logger.info('Server stopped');
    process.exit(0);
  });
});

module.exports = { io, lobbyManager, monsterAIByLobby };
