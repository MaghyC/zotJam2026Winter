/**
 * server/lobbyManager.js
 * 
 * Manages multiple game lobbies and matchmaking.
 * 
 * Responsibilities:
 * - Create new lobbies
 * - Add/remove players from lobbies
 * - Find lobbies with available slots
 * - Start matches when ready
 * - Clean up finished lobbies
 */

import { GameState } from './gameState.js';
import { debugLog } from './config.js';

/**
 * LobbyManager - manages all lobbies on the server
 */
export class LobbyManager {
  constructor(maxLobbies = 10, maxPlayersPerLobby = 8) {
    this.lobbies = new Map(); // lobbyId -> GameState
    this.maxLobbies = maxLobbies;
    this.maxPlayersPerLobby = maxPlayersPerLobby;
    this.lobbyIdCounter = 0;
  }
  
  /**
   * Create a new lobby
   */
  createLobby() {
    if (this.lobbies.size >= this.maxLobbies) {
      debugLog('Cannot create lobby: max lobbies reached');
      return null;
    }
    
    const lobbyId = `lobby_${this.lobbyIdCounter++}`;
    const gameState = new GameState(lobbyId);
    this.lobbies.set(lobbyId, gameState);
    
    debugLog(`Created lobby: ${lobbyId}`);
    return lobbyId;
  }
  
  /**
   * Get a lobby by ID
   */
  getLobby(lobbyId) {
    return this.lobbies.get(lobbyId);
  }
  
  /**
   * Find an available lobby with space for a new player
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
   * Add player to a lobby
   */
  addPlayerToLobby(lobbyId, playerId, playerData) {
    const gameState = this.lobbies.get(lobbyId);
    if (!gameState) {
      debugLog(`Lobby not found: ${lobbyId}`);
      return false;
    }
    
    if (gameState.players.size >= this.maxPlayersPerLobby) {
      debugLog(`Lobby full: ${lobbyId}`);
      return false;
    }
    
    gameState.addPlayer(playerId, playerData);
    debugLog(`Player ${playerId} joined lobby ${lobbyId}`, {
      lobbySize: gameState.players.size,
    });
    
    return true;
  }
  
  /**
   * Remove player from a lobby
   */
  removePlayerFromLobby(lobbyId, playerId) {
    const gameState = this.lobbies.get(lobbyId);
    if (!gameState) return;
    
    gameState.removePlayer(playerId);
    debugLog(`Player ${playerId} left lobby ${lobbyId}`, {
      lobbySize: gameState.players.size,
    });
    
    // Clean up empty lobbies
    if (gameState.players.size === 0 && !gameState.active) {
      this.lobbies.delete(lobbyId);
      debugLog(`Deleted empty lobby: ${lobbyId}`);
    }
  }
  
  /**
   * Get lobby stats for display/debugging
   */
  getLobbiesStats() {
    const stats = [];
    for (const [lobbyId, gameState] of this.lobbies) {
      stats.push({
        lobbyId,
        playerCount: gameState.players.size,
        active: gameState.active,
        monsterCount: gameState.monsters.size,
        orbCount: gameState.orbs.size,
      });
    }
    return stats;
  }
  
  /**
   * Get all lobbies (for admin/debug)
   */
  getAllLobbies() {
    return Array.from(this.lobbies.values());
  }
}
