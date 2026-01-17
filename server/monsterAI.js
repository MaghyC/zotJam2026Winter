/**
 * server/monsterAI.js
 * 
 * Monster AI logic and state management.
 * 
 * This module implements:
 * - Monster spawning in blind spots
 * - AI state machine (ROARING -> IDLE -> HUNTING -> LOST)
 * - Line-of-sight and vision checks
 * - Pathfinding and movement toward targets
 * - Attack logic with cooldowns
 * 
 * Key Concepts:
 * - Blind Spot: A cone behind the player's gaze direction (120 degrees)
 * - Line of Sight: Simplified check - is there a clear line between monster and player?
 * - Hunting: Monster actively chasing a player
 * - Lost: Monster lost track of player but still searching nearby
 */

import {
  MONSTER_SPAWN_DELAY,
  MONSTER_SPAWN_RATIO_TIME,
  MONSTER_ROAR_DURATION,
  MONSTER_BLIND_SPOT_CONE_ANGLE,
  MONSTER_SPAWN_DISTANCE_FROM_PLAYER,
  MONSTER_VISION_RANGE,
  MONSTER_HUNTING_MODE_RANGE,
  MONSTER_LOSE_TRACK_DISTANCE,
  MONSTER_MOVEMENT_SPEED,
  MONSTER_ATTACK_DAMAGE_PERCENT,
  MONSTER_ATTACK_COOLDOWN,
  MONSTER_STATES,
} from '../shared/constants.js';
import { getServerTime, debugLog } from './config.js';

/**
 * MonsterAI - manages all monster AI for a single lobby
 */
export class MonsterAI {
  constructor(gameState, gameLoop) {
    this.gameState = gameState;
    this.gameLoop = gameLoop;
    this.monsterIdCounter = 0;
  }
  
  /**
   * Update all monsters in the lobby (called once per game tick)
   * This is the main AI update loop.
   */
  updateAllMonsters(deltaTime) {
    const monsters = this.gameState.getAllMonsters();
    
    for (const monster of monsters) {
      this.updateSingleMonster(monster, deltaTime);
    }
    
    // Check for spawning new monsters
    this.checkMonsterSpawning();
  }
  
  /**
   * Update a single monster's state and behavior
   */
  updateSingleMonster(monster, deltaTime) {
    const currentTime = getServerTime();
    
    // State machine
    switch (monster.state) {
      case MONSTER_STATES.ROARING:
        this.handleRoaringState(monster, currentTime);
        break;
      case MONSTER_STATES.IDLE:
        this.handleIdleState(monster);
        break;
      case MONSTER_STATES.HUNTING:
        this.handleHuntingState(monster, currentTime, deltaTime);
        break;
      case MONSTER_STATES.LOST:
        this.handleLostState(monster, deltaTime);
        break;
    }
  }
  
  /**
   * ROARING state: Monster just spawned, cannot move, makes scary sounds
   */
  handleRoaringState(monster, currentTime) {
    const elapsedSinceSpawn = (currentTime - monster.spawnTime) / 1000;
    
    if (elapsedSinceSpawn >= MONSTER_ROAR_DURATION) {
      // Roar finished, transition to IDLE
      monster.state = MONSTER_STATES.IDLE;
    }
  }
  
  /**
   * IDLE state: Monster patrols or stands around, looking for targets
   */
  handleIdleState(monster) {
    // Find living players
    const players = this.gameState.getLivingPlayers();
    
    for (const player of players) {
      // Check if monster can see player
      if (this.canMonsterSeePlayer(monster, player)) {
        // Enter hunting mode
        monster.state = MONSTER_STATES.HUNTING;
        monster.targetPlayerId = player.id;
        monster.targetPosition = { ...player.position };
        monster.lastSeenPlayerPosition = { ...player.position };
        monster.lastSightTime = getServerTime();
        debugLog(`Monster ${monster.id} entered HUNTING state, targeting ${player.id}`);
        break;
      }
    }
    
    // TODO: Implement idle patrol behavior (random wandering)
    // For now, just stay still
  }
  
  /**
   * HUNTING state: Monster is actively chasing a player
   */
  handleHuntingState(monster, currentTime, deltaTime) {
    const targetPlayer = this.gameState.getPlayer(monster.targetPlayerId);
    
    if (!targetPlayer || targetPlayer.state === 'DEAD') {
      // Target died or disconnected, return to idle
      monster.state = MONSTER_STATES.IDLE;
      monster.targetPlayerId = null;
      return;
    }
    
    // Update last seen position if can still see player
    if (this.canMonsterSeePlayer(monster, targetPlayer)) {
      monster.lastSeenPlayerPosition = { ...targetPlayer.position };
      monster.lastSightTime = currentTime;
    } else {
      // Lost line of sight, check if lost entirely
      const timeSinceSight = (currentTime - monster.lastSightTime) / 1000;
      if (timeSinceSight > 5) { // TODO: make configurable
        monster.state = MONSTER_STATES.LOST;
        monster.targetPlayerId = null;
        return;
      }
    }
    
    // Move toward last seen position
    this.moveMonsterToward(monster, monster.lastSeenPlayerPosition, deltaTime);
    
    // Check if close enough to attack
    if (this.isMonsterAdjacentToPlayer(monster, targetPlayer)) {
      this.attemptMonsterAttack(monster, targetPlayer, currentTime);
    }
  }
  
  /**
   * LOST state: Monster lost the player, searching nearby
   */
  handleLostState(monster, deltaTime) {
    // TODO: Implement search behavior (spiral outward, check blind spots again)
    // For now, wander randomly
    
    // After 10 seconds of being lost, return to idle
    const timeLost = (getServerTime() - monster.lastSightTime) / 1000;
    if (timeLost > 10) {
      monster.state = MONSTER_STATES.IDLE;
    }
  }
  
  /**
   * Check if monster can see a player
   * 
   * Monster can see if:
   * 1. Player is within MONSTER_VISION_RANGE
   * 2. Player is not in a blind spot (behind an obstacle from monster's perspective)
   * 3. Player is within hunting mode range
   * 
   * Simplified: assume no actual geometry, so check distance and angles
   */
  canMonsterSeePlayer(monster, player) {
    // Distance check
    const dx = player.position.x - monster.position.x;
    const dz = player.position.z - monster.position.z;
    const distance = Math.sqrt(dx * dx + dz * dz);
    
    if (distance > MONSTER_VISION_RANGE) {
      return false;
    }
    
    // TODO: Add line-of-sight raycasting against obstacles here
    // For now, assume clear line of sight
    
    return true;
  }
  
  /**
   * Check if player is in a blind spot relative to monster
   * 
   * Blind spot is a cone BEHIND the player's gaze direction.
   * We spawn monsters in blind spots to surprise players.
   * 
   * Algorithm:
   * 1. Get player's gaze direction (where they're looking)
   * 2. Reverse it (behind them)
   * 3. Check if monster->player vector is within cone angle from this backward direction
   */
  isPlayerInBlindSpot(monster, player) {
    // Vector from player to monster
    const toMonster = {
      x: monster.position.x - player.position.x,
      z: monster.position.z - player.position.z,
    };
    
    // Normalize
    const distToMonster = Math.sqrt(toMonster.x * toMonster.x + toMonster.z * toMonster.z);
    if (distToMonster === 0) return false;
    
    toMonster.x /= distToMonster;
    toMonster.z /= distToMonster;
    
    // Player's backward direction (opposite of gaze)
    const backward = {
      x: -player.gaze.x,
      z: -player.gaze.z,
    };
    
    // Dot product: if close to 1, monster is directly behind
    const dotProduct = toMonster.x * backward.x + toMonster.z * backward.z;
    
    // Convert cone angle to radians and check if within cone
    const coneRadians = (MONSTER_BLIND_SPOT_CONE_ANGLE / 2) * (Math.PI / 180);
    const threshold = Math.cos(coneRadians);
    
    return dotProduct > threshold;
  }
  
  /**
   * Find a valid spawn position for a new monster
   * 
   * Monsters spawn:
   * - In the player's blind spot (behind them)
   * - At least MONSTER_SPAWN_DISTANCE_FROM_PLAYER away
   * - Inside the arena
   */
  findMonsterSpawnPosition(player) {
    // Simple strategy: place monster directly behind player at spawn distance
    // In a more complex version, you'd add randomness and avoid obstacles
    
    const backwardDistance = MONSTER_SPAWN_DISTANCE_FROM_PLAYER;
    const spawnX = player.position.x - player.gaze.x * backwardDistance;
    const spawnZ = player.position.z - player.gaze.z * backwardDistance;
    
    return {
      x: spawnX,
      y: 1, // above ground
      z: spawnZ,
    };
  }
  
  /**
   * Move monster toward a target position
   */
  moveMonsterToward(monster, targetPos, deltaTime) {
    const dx = targetPos.x - monster.position.x;
    const dz = targetPos.z - monster.position.z;
    const distance = Math.sqrt(dx * dx + dz * dz);
    
    if (distance < 0.1) {
      // Close enough
      monster.position = { ...targetPos };
      return;
    }
    
    // Normalize and apply movement speed
    const moveDistance = MONSTER_MOVEMENT_SPEED * deltaTime;
    const moveX = (dx / distance) * moveDistance;
    const moveZ = (dz / distance) * moveDistance;
    
    monster.position.x += moveX;
    monster.position.z += moveZ;
    
    // Update gaze to point toward target
    monster.gaze = {
      x: dx / distance,
      y: 0,
      z: dz / distance,
    };
  }
  
  /**
   * Check if monster is close enough to attack
   */
  isMonsterAdjacentToPlayer(monster, player) {
    const dx = player.position.x - monster.position.x;
    const dz = player.position.z - monster.position.z;
    const distance = Math.sqrt(dx * dx + dz * dz);
    
    return distance < 2; // 2 unit attack range
  }
  
  /**
   * Execute a monster attack on a player
   */
  attemptMonsterAttack(monster, player, currentTime) {
    // Check cooldown
    if (currentTime < monster.nextAttackTime) {
      return;
    }
    
    // Deal damage
    const damageAmount = player.maxHealth * MONSTER_ATTACK_DAMAGE_PERCENT;
    this.gameState.damagePlayer(player.id, damageAmount);
    
    monster.nextAttackTime = currentTime + (MONSTER_ATTACK_COOLDOWN * 1000);
    
    debugLog(`Monster ${monster.id} attacked player ${player.id}`, {
      damage: damageAmount,
      playerHealthAfter: player.health,
    });
  }
  
  /**
   * Check if new monsters should spawn this tick
   */
  checkMonsterSpawning() {
    const elapsedTime = this.gameState.getMatchElapsedTime();
    
    // Don't spawn monsters until MONSTER_SPAWN_DELAY
    if (elapsedTime < MONSTER_SPAWN_DELAY) {
      return;
    }
    
    // After MONSTER_SPAWN_RATIO_TIME, spawn 1 monster per living player
    if (elapsedTime >= MONSTER_SPAWN_RATIO_TIME) {
      const livingPlayers = this.gameState.getLivingPlayers();
      const targetMonsterCount = livingPlayers.length;
      const currentMonsterCount = this.gameState.getAllMonsters().length;
      
      // Spawn additional monsters if below target
      const toSpawn = targetMonsterCount - currentMonsterCount;
      
      for (let i = 0; i < toSpawn; i++) {
        // Pick a random living player to spawn near
        const player = livingPlayers[Math.floor(Math.random() * livingPlayers.length)];
        if (player) {
          this.spawnMonster(player);
        }
      }
    }
  }
  
  /**
   * Spawn a new monster in blind spot of target player
   */
  spawnMonster(targetPlayer) {
    const spawnPos = this.findMonsterSpawnPosition(targetPlayer);
    const monsterId = `monster_${this.gameState.lobbyId}_${this.monsterIdCounter++}`;
    
    this.gameState.spawnMonster(monsterId, {
      position: spawnPos,
      targetPosition: spawnPos,
      gaze: { x: 0, y: 0, z: 1 },
    });
    
    debugLog(`Monster spawned: ${monsterId} at position`, spawnPos);
  }
  
  /**
   * TODO: Get nearby obstacles for line-of-sight calculations
   * This is a placeholder - in a real implementation, you'd have a spatial
   * data structure of obstacles and ray-cast against them.
   */
  getObstaclesNear(position, radius) {
    // TODO: implement
    return [];
  }
}
