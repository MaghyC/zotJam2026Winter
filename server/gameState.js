/**
 * server/gameState.js
 * 
 * Maintains the authoritative game state on the server.
 * This is the single source of truth for all lobbies, players, monsters, and orbs.
 * 
 * Architecture:
 * - Each lobby has its own game state
 * - Players can only see/interact with their own lobby
 * - The server validates all actions and updates this state
 * - Clients receive updates from this state
 */

import {
  PLAYER_STATES,
  MONSTER_STATES,
  ATTACHMENT_STATES,
  ORB_SCORE_VALUE,
  ARENA_INITIAL_RADIUS,
} from '../shared/constants.js';
import { getServerTime, debugLog } from './config.js';

/**
 * GameState - manages state for a single lobby/match
 */
export class GameState {
  constructor(lobbyId) {
    this.lobbyId = lobbyId;
    this.players = new Map(); // playerId -> Player
    this.monsters = new Map(); // monsterId -> Monster
    this.orbs = new Map(); // orbId -> Orb
    
    // Game phase timing
    this.matchStartTime = null; // will be set when match starts
    this.active = false;
    
    // Arena state
    this.arenaSafeRadius = ARENA_INITIAL_RADIUS;
    this.centerX = 0; // arena center position
    this.centerZ = 0;
    
    // Monster spawn tracking
    this.lastMonsterSpawnTime = 0;
    this.monstersSpawnedThisPhase = 0;
  }
  
  /**
   * Get elapsed time since match start (in seconds)
   */
  getMatchElapsedTime() {
    if (!this.matchStartTime) return 0;
    return (getServerTime() - this.matchStartTime) / 1000;
  }
  
  /**
   * Add a player to this lobby
   */
  addPlayer(playerId, playerData) {
    debugLog(`Adding player ${playerId} to lobby ${this.lobbyId}`);
    this.players.set(playerId, {
      id: playerId,
      ...playerData,
      state: PLAYER_STATES.ALIVE,
      health: 100,
      maxHealth: 100,
      score: 0,
      blinkCooldownEnd: 0,
      attachedTo: null,
      attachmentState: ATTACHMENT_STATES.ALONE,
      lastAttackTime: 0,
      position: { x: Math.random() * 40 - 20, y: 1, z: Math.random() * 40 - 20 },
      rotation: { x: 0, y: 0, z: 0 },
      gaze: { x: 0, y: 0, z: 1 }, // default looking forward
    });
  }
  
  /**
   * Remove a player from this lobby
   */
  removePlayer(playerId) {
    debugLog(`Removing player ${playerId} from lobby ${this.lobbyId}`);
    
    // If player is attached, detach them
    const player = this.players.get(playerId);
    if (player && player.attachedTo) {
      const attachedPlayer = this.players.get(player.attachedTo);
      if (attachedPlayer) {
        attachedPlayer.attachedTo = null;
        attachedPlayer.attachmentState = ATTACHMENT_STATES.ALONE;
      }
    }
    
    this.players.delete(playerId);
  }
  
  /**
   * Get a player by ID
   */
  getPlayer(playerId) {
    return this.players.get(playerId);
  }
  
  /**
   * Update player position and rotation (called frequently from input)
   */
  updatePlayerTransform(playerId, position, rotation, gaze) {
    const player = this.players.get(playerId);
    if (player) {
      player.position = position;
      player.rotation = rotation;
      player.gaze = gaze; // normalized direction vector
    }
  }
  
  /**
   * Check if player can blink (cooldown expired)
   */
  canBlink(playerId) {
    const player = this.players.get(playerId);
    if (!player) return false;
    return getServerTime() >= player.blinkCooldownEnd;
  }
  
  /**
   * Execute a blink action for player (resets cooldown)
   */
  executeBlink(playerId, cooldownSeconds) {
    const player = this.players.get(playerId);
    if (player) {
      player.blinkCooldownEnd = getServerTime() + (cooldownSeconds * 1000);
      debugLog(`Player ${playerId} blinked, cooldown ends at ${player.blinkCooldownEnd}`);
    }
  }
  
  /**
   * Get time remaining on blink cooldown (in seconds)
   */
  getBlinkCooldownRemaining(playerId) {
    const player = this.players.get(playerId);
    if (!player) return 0;
    const remaining = (player.blinkCooldownEnd - getServerTime()) / 1000;
    return Math.max(0, remaining);
  }
  
  /**
   * Spawn an orb at a random location
   */
  spawnOrb(orbId, position) {
    this.orbs.set(orbId, {
      id: orbId,
      position: position,
      value: ORB_SCORE_VALUE,
      collected: false,
    });
  }
  
  /**
   * Mark an orb as collected
   */
  collectOrb(orbId) {
    const orb = this.orbs.get(orbId);
    if (orb && !orb.collected) {
      orb.collected = true;
      return orb.value;
    }
    return 0;
  }
  
  /**
   * Add score to a player
   */
  addScore(playerId, points) {
    const player = this.players.get(playerId);
    if (player) {
      player.score += points;
    }
  }
  
  /**
   * Damage a player from monster attack
   */
  damagePlayer(playerId, damageAmount) {
    const player = this.players.get(playerId);
    if (player) {
      player.health = Math.max(0, player.health - damageAmount);
      player.lastAttackTime = getServerTime();
      if (player.health <= 0) {
        player.state = PLAYER_STATES.DEAD;
      }
    }
  }
  
  /**
   * Heal a player over time (called every tick)
   */
  regenPlayer(playerId, regenAmount) {
    const player = this.players.get(playerId);
    if (player && player.health > 0) {
      player.health = Math.min(player.maxHealth, player.health + regenAmount);
    }
  }
  
  /**
   * Add a monster to the game state
   */
  spawnMonster(monsterId, monsterData) {
    debugLog(`Monster ${monsterId} spawned in lobby ${this.lobbyId}`);
    this.monsters.set(monsterId, {
      id: monsterId,
      ...monsterData,
      state: MONSTER_STATES.ROARING,
      health: 50,
      maxHealth: 50,
      targetPlayerId: null,
      spawnTime: getServerTime(),
      nextAttackTime: 0,
      lastSeenPlayerPosition: null,
      lastSightTime: 0,
    });
  }
  
  /**
   * Get a monster by ID
   */
  getMonster(monsterId) {
    return this.monsters.get(monsterId);
  }
  
  /**
   * Remove a monster (when killed)
   */
  removeMonster(monsterId) {
    this.monsters.delete(monsterId);
  }
  
  /**
   * Get all living players in this lobby
   */
  getLivingPlayers() {
    return Array.from(this.players.values()).filter(p => p.state === PLAYER_STATES.ALIVE);
  }
  
  /**
   * Get all players in this lobby
   */
  getAllPlayers() {
    return Array.from(this.players.values());
  }
  
  /**
   * Get all monsters in this lobby
   */
  getAllMonsters() {
    return Array.from(this.monsters.values());
  }
  
  /**
   * Get all uncollected orbs
   */
  getActiveOrbs() {
    return Array.from(this.orbs.values()).filter(o => !o.collected);
  }
  
  /**
   * Request attachment between two players
   * Returns true if successful, false if unable to attach
   */
  requestAttachment(fromPlayerId, toPlayerId) {
    const fromPlayer = this.players.get(fromPlayerId);
    const toPlayer = this.players.get(toPlayerId);
    
    if (!fromPlayer || !toPlayer) return false;
    if (fromPlayer.attachmentState !== ATTACHMENT_STATES.ALONE) return false;
    if (toPlayer.attachmentState !== ATTACHMENT_STATES.ALONE) return false;
    
    // Mark that request was sent/received
    fromPlayer.attachmentState = ATTACHMENT_STATES.REQUEST_SENT;
    toPlayer.attachmentState = ATTACHMENT_STATES.REQUEST_RECEIVED;
    
    return true;
  }
  
  /**
   * Accept attachment between two players
   */
  acceptAttachment(respondingPlayerId, requestingPlayerId) {
    const responding = this.players.get(respondingPlayerId);
    const requesting = this.players.get(requestingPlayerId);
    
    if (!responding || !requesting) return false;
    
    // Both now attached back-to-back
    responding.attachedTo = requestingPlayerId;
    requesting.attachedTo = respondingPlayerId;
    responding.attachmentState = ATTACHMENT_STATES.ATTACHED;
    requesting.attachmentState = ATTACHMENT_STATES.ATTACHED;
    
    debugLog(`Players ${respondingPlayerId} and ${requestingPlayerId} are now attached`);
    return true;
  }
  
  /**
   * Decline or cancel an attachment request
   */
  declineAttachment(playerId, otherPlayerId) {
    const player = this.players.get(playerId);
    const other = this.players.get(otherPlayerId);
    
    if (player) {
      player.attachmentState = ATTACHMENT_STATES.ALONE;
    }
    if (other) {
      other.attachmentState = ATTACHMENT_STATES.ALONE;
    }
  }
  
  /**
   * Detach two players
   */
  detachPlayers(playerId) {
    const player = this.players.get(playerId);
    if (!player) return;
    
    const otherPlayerId = player.attachedTo;
    player.attachedTo = null;
    player.attachmentState = ATTACHMENT_STATES.ALONE;
    
    if (otherPlayerId) {
      const other = this.players.get(otherPlayerId);
      if (other) {
        other.attachedTo = null;
        other.attachmentState = ATTACHMENT_STATES.ALONE;
      }
    }
    
    debugLog(`Players ${playerId} and ${otherPlayerId} have detached`);
  }
  
  /**
   * Get nearby players within a radius for broadcasts
   */
  getNearbyPlayers(fromPlayerId, radius) {
    const fromPlayer = this.players.get(fromPlayerId);
    if (!fromPlayer) return [];
    
    return Array.from(this.players.values()).filter(p => {
      if (p.id === fromPlayerId) return false; // Don't include self
      const dx = p.position.x - fromPlayer.position.x;
      const dz = p.position.z - fromPlayer.position.z;
      const distance = Math.sqrt(dx * dx + dz * dz);
      return distance <= radius;
    });
  }
}
