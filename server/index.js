/**
 * server/index.js
 * 
 * Main server file - creates HTTP server, WebSocket/Socket.IO server, and handles player connections.
 * 
 * Architecture:
 * - Express HTTP server for serving static files (itch.io compatible)
 * - Socket.IO for real-time multiplayer communication
 * - Game loop that updates all lobbies every tick
 * 
 * Connection Flow:
 * 1. Player connects via WebSocket
 * 2. Server creates player object and assigns to lobby
 * 3. Server sends lobby state to player
 * 4. Player's input is received and validated server-side
 * 5. Server broadcasts state to all players in lobby
 */

import express from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  MESSAGE_TYPES,
  NETWORK_TICK_RATE,
  BLINK_COOLDOWN_DURATION,
  BLINK_TIMER_BROADCAST_RANGE,
  ATTACHMENT_REQUEST_TIMEOUT,
} from '../shared/constants.js';
import { LobbyManager } from './lobbyManager.js';
import { MonsterAI } from './monsterAI.js';
import { SERVER_CONFIG, debugLog, getServerTime } from './config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const httpServer = createServer(app);
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

// Serve static files from dist directory
app.use(express.static(path.join(__dirname, '../dist')));
app.use(express.static(path.join(__dirname, '../client')));

// Fallback to index.html for SPA
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/index.html'));
});

// ===== GAME STATE =====
const lobbyManager = new LobbyManager(10, 8);
const monsterAIByLobby = new Map(); // lobbyId -> MonsterAI

// ===== GAME LOOP =====
const TICK_RATE = NETWORK_TICK_RATE; // 30 Hz
const TICK_INTERVAL = 1000 / TICK_RATE;
let gameLoopId = null;

function startGameLoop() {
  if (gameLoopId) return; // Already running
  
  debugLog('Starting game loop');
  gameLoopId = setInterval(updateAllLobbies, TICK_INTERVAL);
}

function stopGameLoop() {
  if (gameLoopId) {
    clearInterval(gameLoopId);
    gameLoopId = null;
    debugLog('Stopped game loop');
  }
}

/**
 * Main game update loop - called every TICK_INTERVAL milliseconds
 */
function updateAllLobbies() {
  const lobbies = lobbyManager.getAllLobbies();
  
  for (const gameState of lobbies) {
    if (!gameState.active) continue;
    
    const deltaTime = TICK_INTERVAL / 1000; // seconds
    
    // Update monster AI
    const monsterAI = monsterAIByLobby.get(gameState.lobbyId);
    if (monsterAI) {
      monsterAI.updateAllMonsters(deltaTime);
    }
    
    // TODO: Update player health regeneration after being attacked
    // TODO: Update arena shrinking
    // TODO: Sync positions to clients
    
    // Broadcast updated state to all players in this lobby
    broadcastLobbyState(gameState);
  }
}

/**
 * Send lobby state to all connected players
 */
function broadcastLobbyState(gameState) {
  const players = Array.from(gameState.players.values()).map(p => ({
    id: p.id,
    position: p.position,
    rotation: p.rotation,
    health: p.health,
    score: p.score,
  }));
  
  const monsters = Array.from(gameState.monsters.values()).map(m => ({
    id: m.id,
    position: m.position,
    state: m.state,
  }));
  
  const payload = {
    players,
    monsters,
    arenaSafeRadius: gameState.arenaSafeRadius,
    gameTime: gameState.getMatchElapsedTime(),
  };
  
  io.to(gameState.lobbyId).emit(MESSAGE_TYPES.LOBBY_STATE, payload);
}

// ===== SOCKET.IO EVENT HANDLERS =====

io.on('connection', (socket) => {
  debugLog('Player connected', { socketId: socket.id });
  
  let currentLobbyId = null;
  let currentPlayerId = socket.id;
  
  /**
   * JOIN_LOBBY - player wants to join or create a lobby
   */
  socket.on(MESSAGE_TYPES.JOIN_LOBBY, (data) => {
    debugLog('Player requesting to join lobby', { playerId: currentPlayerId, data });
    
    // Find or create lobby
    let lobbyId = data.lobbyId || lobbyManager.findAvailableLobby();
    
    if (!lobbyId) {
      socket.emit('ERROR', { message: 'No lobbies available' });
      return;
    }
    
    // Add player to lobby
    const playerData = {
      name: data.playerName || `Player${currentPlayerId.slice(-4)}`,
    };
    
    const success = lobbyManager.addPlayerToLobby(lobbyId, currentPlayerId, playerData);
    
    if (!success) {
      socket.emit('ERROR', { message: 'Failed to join lobby' });
      return;
    }
    
    currentLobbyId = lobbyId;
    socket.join(lobbyId);
    
    // If this is the first player, create MonsterAI for this lobby
    const gameState = lobbyManager.getLobby(lobbyId);
    if (!monsterAIByLobby.has(lobbyId)) {
      const monsterAI = new MonsterAI(gameState, null);
      monsterAIByLobby.set(lobbyId, monsterAI);
    }
    
    // Send confirmation and initial state
    socket.emit(MESSAGE_TYPES.LOBBY_STATE, {
      lobbyId,
      playerId: currentPlayerId,
      players: Array.from(gameState.players.values()),
    });
    
    // Notify others in lobby
    socket.to(lobbyId).emit('PLAYER_JOINED', {
      playerId: currentPlayerId,
      playerName: playerData.name,
    });
    
    debugLog(`Player ${currentPlayerId} successfully joined lobby ${lobbyId}`);
  });
  
  /**
   * PLAYER_POSITION - player sends their position/rotation update
   */
  socket.on(MESSAGE_TYPES.PLAYER_POSITION, (data) => {
    if (!currentLobbyId) return;
    
    const gameState = lobbyManager.getLobby(currentLobbyId);
    if (!gameState) return;
    
    gameState.updatePlayerTransform(currentPlayerId, data.position, data.rotation, data.gaze);
  });
  
  /**
   * BLINK_ACTION - player attempts to blink
   */
  socket.on(MESSAGE_TYPES.BLINK_ACTION, (data) => {
    if (!currentLobbyId) return;
    
    const gameState = lobbyManager.getLobby(currentLobbyId);
    if (!gameState) return;
    
    if (gameState.canBlink(currentPlayerId)) {
      gameState.executeBlink(currentPlayerId, BLINK_COOLDOWN_DURATION);
      
      // Broadcast blink to nearby players (for visual effect)
      socket.to(currentLobbyId).emit(MESSAGE_TYPES.BLINK_ACTION, {
        playerId: currentPlayerId,
      });
    }
  });
  
  /**
   * COLLECT_ORB - player collects an orb
   */
  socket.on(MESSAGE_TYPES.COLLECT_ORB, (data) => {
    if (!currentLobbyId) return;
    
    const gameState = lobbyManager.getLobby(currentLobbyId);
    if (!gameState) return;
    
    const points = gameState.collectOrb(data.orbId);
    
    if (points > 0) {
      gameState.addScore(currentPlayerId, points);
      
      io.to(currentLobbyId).emit(MESSAGE_TYPES.ORB_COLLECTED, {
        orbId: data.orbId,
        playerId: currentPlayerId,
        points,
      });
    }
  });
  
  /**
   * ATTACH_REQUEST - player requests to attach with another player
   */
  socket.on(MESSAGE_TYPES.ATTACH_REQUEST, (data) => {
    if (!currentLobbyId) return;
    
    const gameState = lobbyManager.getLobby(currentLobbyId);
    if (!gameState) return;
    
    const success = gameState.requestAttachment(currentPlayerId, data.targetPlayerId);
    
    if (success) {
      // Send request to target player
      io.to(currentLobbyId).emit(MESSAGE_TYPES.ATTACH_REQUEST, {
        from: currentPlayerId,
        to: data.targetPlayerId,
      });
      
      debugLog(`Attachment request from ${currentPlayerId} to ${data.targetPlayerId}`);
    }
  });
  
  /**
   * ATTACH_RESPONSE - player accepts or declines attachment
   */
  socket.on(MESSAGE_TYPES.ATTACH_RESPONSE, (data) => {
    if (!currentLobbyId) return;
    
    const gameState = lobbyManager.getLobby(currentLobbyId);
    if (!gameState) return;
    
    if (data.accepted) {
      gameState.acceptAttachment(currentPlayerId, data.from);
      
      io.to(currentLobbyId).emit(MESSAGE_TYPES.ATTACH_RESPONSE, {
        from: data.from,
        to: currentPlayerId,
        accepted: true,
      });
      
      debugLog(`${currentPlayerId} accepted attachment from ${data.from}`);
    } else {
      gameState.declineAttachment(currentPlayerId, data.from);
      
      socket.to(data.from).emit(MESSAGE_TYPES.ATTACH_RESPONSE, {
        from: data.from,
        to: currentPlayerId,
        accepted: false,
      });
    }
  });
  
  /**
   * DETACH - player wants to detach from their partner
   */
  socket.on(MESSAGE_TYPES.DETACH, (data) => {
    if (!currentLobbyId) return;
    
    const gameState = lobbyManager.getLobby(currentLobbyId);
    if (!gameState) return;
    
    gameState.detachPlayers(currentPlayerId);
    
    io.to(currentLobbyId).emit(MESSAGE_TYPES.DETACH, {
      playerId: currentPlayerId,
    });
  });
  
  /**
   * BLINK_TIMER_BROADCAST - player broadcasts their blink timer to nearby players
   */
  socket.on(MESSAGE_TYPES.BLINK_TIMER_BROADCAST, (data) => {
    if (!currentLobbyId) return;
    
    const gameState = lobbyManager.getLobby(currentLobbyId);
    if (!gameState) return;
    
    const nearbyPlayers = gameState.getNearbyPlayers(currentPlayerId, BLINK_TIMER_BROADCAST_RANGE);
    
    for (const nearbyPlayer of nearbyPlayers) {
      const socketId = nearbyPlayer.id;
      io.to(socketId).emit(MESSAGE_TYPES.BLINK_TIMER_BROADCAST, {
        from: currentPlayerId,
        blinkTimerRemaining: gameState.getBlinkCooldownRemaining(currentPlayerId),
      });
    }
  });
  
  /**
   * DISCONNECT - player left the game
   */
  socket.on('disconnect', () => {
    debugLog('Player disconnected', { playerId: currentPlayerId });
    
    if (currentLobbyId) {
      lobbyManager.removePlayerFromLobby(currentLobbyId, currentPlayerId);
      
      // Notify other players
      socket.to(currentLobbyId).emit('PLAYER_LEFT', {
        playerId: currentPlayerId,
      });
    }
  });
});

// ===== SERVER STARTUP =====

const PORT = process.env.PORT || SERVER_CONFIG.PORT;

httpServer.listen(PORT, SERVER_CONFIG.HOST, () => {
  debugLog(`Server running on http://${SERVER_CONFIG.HOST}:${PORT}`);
  debugLog('Waiting for players to connect...');
  
  // Start game loop when first player joins
  // (We'll improve this logic later to only run active lobbies)
  setTimeout(() => {
    startGameLoop();
  }, 1000);
});

// Graceful shutdown
process.on('SIGINT', () => {
  debugLog('Shutting down server...');
  stopGameLoop();
  httpServer.close(() => {
    debugLog('Server closed');
    process.exit(0);
  });
});

// Debug endpoint to view server stats
app.get('/admin/stats', (req, res) => {
  const stats = {
    lobbies: lobbyManager.getLobbiesStats(),
    timestamp: new Date().toISOString(),
  };
  res.json(stats);
});
