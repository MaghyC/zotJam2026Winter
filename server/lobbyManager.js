/**
 * server/lobbyManager.js
 * 
 * Manages multiple game lobbies and matchmaking.
 * Production-ready system with proper lobby creation, player management, and cleanup.
 */

const { GameState, PLAYER_STATES } = require('./gameState.js');
const { CONFIG, logger } = require('./config.js');

/**
 * LobbyManager - manages all lobbies on the server
 */
class LobbyManager {
  constructor(maxLobbies = CONFIG.MAX_LOBBIES, maxPlayersPerLobby = CONFIG.PLAYERS_PER_LOBBY) {
    this.lobbies = new Map(); // lobbyId -> GameState
    this.playerLobbies = new Map(); // playerId -> lobbyId (for quick lookup)
    this.maxLobbies = maxLobbies;
    this.maxPlayersPerLobby = maxPlayersPerLobby;
    this.lobbyIdCounter = 0;
  }

  /**
   * Create a new lobby with a unique ID
   */
  createLobby() {
    if (this.lobbies.size >= this.maxLobbies) {
      logger.warn('Cannot create lobby: max lobbies reached');
      return null;
    }

    const lobbyId = this.generateLobbyCode();
    const gameState = new GameState(lobbyId);
    this.lobbies.set(lobbyId, gameState);

    logger.info(`Created lobby: ${lobbyId}`);
    return lobbyId;
  }

  /**
   * Generate a unique 4-character lobby code for players to join
   */
  generateLobbyCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 4; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    // Ensure uniqueness
    if (this.lobbies.has(code)) {
      return this.generateLobbyCode();
    }
    return code;
  }

  /**
   * Get a lobby by ID
   */
  getLobby(lobbyId) {
    return this.lobbies.get(lobbyId);
  }

  /**
   * Find an available lobby with space for a new player (not yet started)
   */
  findAvailableLobby() {
    for (const [lobbyId, gameState] of this.lobbies) {
      const playerCount = gameState.players.size;
      if (playerCount < this.maxPlayersPerLobby && !gameState.active) {
        return lobbyId;
      }
    }

    // No available lobby, create new one if possible
    if (this.lobbies.size < this.maxLobbies) {
      return this.createLobby();
    }

    return null;
  }

  /**
   * Get the lobby a player is in
   */
  getPlayerLobby(playerId) {
    return this.playerLobbies.get(playerId);
  }

  /**
   * Add player to a specific lobby
   */
  addPlayerToLobby(lobbyId, playerId, playerData) {
    const gameState = this.lobbies.get(lobbyId);
    if (!gameState) {
      logger.warn(`Lobby not found: ${lobbyId}`);
      return false;
    }

    if (gameState.players.size >= this.maxPlayersPerLobby) {
      logger.warn(`Lobby full: ${lobbyId}`);
      return false;
    }

    gameState.addPlayer(playerId, playerData);
    this.playerLobbies.set(playerId, lobbyId);

    logger.info(`Player ${playerId} joined lobby ${lobbyId} (${gameState.players.size}/${this.maxPlayersPerLobby})`);

    return true;
  }

  /**
   * Remove player from their lobby
   */
  removePlayerFromLobby(playerId) {
    const lobbyId = this.playerLobbies.get(playerId);
    if (!lobbyId) return false;

    const gameState = this.lobbies.get(lobbyId);
    if (!gameState) return false;

    gameState.removePlayer(playerId);
    this.playerLobbies.delete(playerId);

    logger.info(`Player ${playerId} left lobby ${lobbyId} (${gameState.players.size} remaining)`);

    // Clean up empty lobbies
    if (gameState.players.size === 0 && !gameState.active) {
      this.lobbies.delete(lobbyId);
      logger.debug(`Deleted empty lobby: ${lobbyId}`);
    }

    return true;
  }

  /**
   * Start a match in a lobby
   */
  startLobbyMatch(lobbyId) {
    const gameState = this.lobbies.get(lobbyId);
    if (!gameState) {
      logger.warn(`Cannot start: lobby not found ${lobbyId}`);
      return false;
    }

    if (gameState.active) {
      logger.warn(`Lobby already active: ${lobbyId}`);
      return false;
    }

    if (gameState.players.size < 1) {
      logger.warn(`Cannot start: not enough players in lobby ${lobbyId}`);
      return false;
    }
    gameState.resetForNewMatch();
    gameState.startMatch();

    // Spawn initial orbs
    gameState.spawnRandomOrbs(CONFIG.ORB_COUNT_INITIAL);

    logger.info(`Match started in lobby ${lobbyId} with ${gameState.players.size} players`);
    return true;
  }

  /**
   * Check if a lobby should end (last player alive or arena shrunk to zero)
   */
  shouldEndLobby(lobbyId) {
    const gameState = this.lobbies.get(lobbyId);
    if (!gameState) return false;

    const livingPlayers = gameState.getLivingPlayers();
    if (livingPlayers.length <= 1) {
      return true; // Only 0-1 players alive
    }

    // Arena at final size
    if (gameState.arenaSafeRadius <= CONFIG.ARENA_FINAL_RADIUS) {
      return true;
    }

    return false;
  }

  /**
   * Get winner/survivors of a lobby
   */
  getLobbyWinners(lobbyId) {
    const gameState = this.lobbies.get(lobbyId);
    if (!gameState) return [];

    // Get player(s) with highest score
    const players = Array.from(gameState.players.values());
    if (players.length === 0) return [];

    const maxScore = Math.max(...players.map(p => p.score));
    return players.filter(p => p.score === maxScore);
  }

  /**
   * End a match and return results
   */
  endLobbyMatch(lobbyId) {
    const gameState = this.lobbies.get(lobbyId);
    if (!gameState) return null;

    gameState.active = false;

    const winners = this.getLobbyWinners(lobbyId);
    const stats = {
      lobbyId,
      duration: gameState.getMatchElapsedTime(),
      winners: winners.map(p => ({ id: p.id, username: p.username, score: p.score })),
      playerStats: Array.from(gameState.players.values()).map(p => ({
        id: p.id,
        username: p.username,
        score: p.score,
        orbsCollected: p.orbsCollected,
        state: p.state,
      })),
    };

    logger.info(`Match ended in lobby ${lobbyId}`, stats);
    return stats;
  }

  /**
   * Get lobby statistics for display/debugging
   */
  getLobbiesStats() {
    const stats = [];
    for (const [lobbyId, gameState] of this.lobbies) {
      stats.push({
        code: lobbyId,
        players: gameState.players.size,
        maxPlayers: this.maxPlayersPerLobby,
        active: gameState.active,
        elapsedTime: gameState.getMatchElapsedTime(),
        monsters: gameState.monsters.size,
        orbs: gameState.getActiveOrbs().length,
        arenaSafeRadius: gameState.arenaSafeRadius.toFixed(1),
      });
    }
    return stats;
  }

  /**
   * Get all lobbies (for admin/debug)
   */
  getAllLobbies() {
    return Array.from(this.lobbies.entries()); // [lobbyId, gameState]
  }
}

module.exports = { LobbyManager };
