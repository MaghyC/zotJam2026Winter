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

const { CONFIG, logger } = require('./config.js');

// Game state constants
const PLAYER_STATES = {
  ALIVE: 'alive',
  DEAD: 'dead',
  SPECTATING: 'spectating',
};

const MONSTER_STATES = {
  ROARING: 'roaring',
  HUNTING: 'hunting',
  IDLE: 'idle',
  ATTACKING: 'attacking',
  DEAD: 'dead',
};

const ATTACHMENT_STATES = {
  ALONE: 'alone',
  REQUEST_SENT: 'request_sent',
  REQUEST_RECEIVED: 'request_received',
  ATTACHED: 'attached',
};

const ORB_SCORE_VALUE = 10;

/**
 * GameState - manages state for a single lobby/match
 */
class GameState {
  constructor(lobbyId) {
    this.lobbyId = lobbyId;
    this.players = new Map(); // playerId -> Player
    this.monsters = new Map(); // monsterId -> Monster
    this.orbs = new Map(); // orbId -> Orb
    this.obstacles = new Map(); // obstacleId -> Obstacle

    // Game phase timing
    this.matchStartTime = null; // will be set when match starts
    this.active = false;

    // Arena state
    this.arenaSafeRadius = CONFIG.ARENA_RADIUS;
    this.centerX = 0; // arena center position
    this.centerZ = 0;

    // Monster spawn tracking
    this.lastMonsterSpawnTime = 0;
    this.monstersSpawnedThisPhase = 0;

    // Last network state snapshot (for delta updates)
    this.lastNetworkUpdate = Date.now();
  }

  /**
   * Get elapsed time since match start (in milliseconds)
   */
  getMatchElapsedTime() {
    if (!this.matchStartTime) return 0;
    return Date.now() - this.matchStartTime;
  }

  /**
   * Start the match
   */
  // Add to GameState class
  resetForNewMatch() {
    // Reset arena
    this.arenaSafeRadius = CONFIG.ARENA_RADIUS;  // Back to 100
    this.centerX = 0;
    this.centerZ = 0;

    // Reset all players (keep them, reset stats)
    for (const player of this.players.values()) {
      player.score = 0;
      player.orbsCollected = 0;
      player.health = CONFIG.PLAYER_MAX_HEALTH;
      player.state = PLAYER_STATES.ALIVE;
      player.blinkCooldownEnd = 0;  // Ready to blink
      // Respawn position
      const angle = Math.random() * Math.PI * 2;
      const distance = Math.random() * 30;
      player.position = {
        x: this.centerX + Math.cos(angle) * distance,
        y: CONFIG.PLAYER_HEIGHT,
        z: this.centerZ + Math.sin(angle) * distance
      };
      player.ready = false;  // Reset ready
    }

    // Clear game objects
    this.orbs.clear();
    this.obstacles.clear();
    this.monsters.clear();
    this.matchStartTime = null;  // Will be set by startMatch
  }

  startMatch() {
    this.matchStartTime = Date.now();
    this.active = true;
    logger.info(`Lobby ${this.lobbyId}: Match started`);
  }

  /**
   * Add a player to this lobby
   */
  addPlayer(playerId, playerData) {
    logger.debug(`Adding player ${playerId} to lobby ${this.lobbyId}`);

    // Random spawn position within safe zone
    const angle = Math.random() * Math.PI * 2;
    const distance = Math.random() * 30;
    const spawnX = this.centerX + Math.cos(angle) * distance;
    const spawnZ = this.centerZ + Math.sin(angle) * distance;

    this.players.set(playerId, {
      id: playerId,
      username: playerData.username || `Player_${playerId.slice(0, 4)}`,
      state: PLAYER_STATES.ALIVE,
      health: CONFIG.PLAYER_MAX_HEALTH,
      maxHealth: CONFIG.PLAYER_MAX_HEALTH,
      score: 0,
      orbsCollected: 0,
      lastBlinkTime: 0,
      attachedTo: null,
      attachmentState: ATTACHMENT_STATES.ALONE,
      lastAttackTime: 0,
      lastRegenTime: Date.now(),
      ready: false, // New: track if player is ready to start

      // Spatial state
      position: { x: spawnX, y: CONFIG.PLAYER_HEIGHT, z: spawnZ },
      rotation: { x: 0, y: Math.random() * Math.PI * 2, z: 0 },
      gaze: { x: 0, y: 0, z: 1 }, // normalized direction vector (forward)
      velocity: { x: 0, y: 0, z: 0 },

      // Pairing state
      pairRequestPendingTo: null,
      pairRequestFrom: [],

      // Control request state when attached
      controlRequestPendingTo: null,
      controlRequestFrom: [],
      isControlling: true,

      // For spectating when dead
      spectatingPlayerId: null,
    });

    const player = this.players.get(playerId);
    logger.info(`Player ${playerId} health after spawn: ${player.health}`);
  }

  /**
   * Remove a player from this lobby
   */
  removePlayer(playerId) {
    logger.debug(`Removing player ${playerId} from lobby ${this.lobbyId}`);

    // If player is attached, detach them
    const player = this.players.get(playerId);
    if (player && player.attachedTo) {
      this.detachPlayers(playerId);
    }

    // Remove any pending pair requests
    for (const [, p] of this.players) {
      if (p.pairRequestPendingTo === playerId) {
        p.pairRequestPendingTo = null;
      }
      p.pairRequestFrom = p.pairRequestFrom.filter(id => id !== playerId);
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
    if (!player) return;

    if (player && player.state === PLAYER_STATES.ALIVE) {
      // Validate position data
      if (!position || typeof position.x !== 'number' || typeof position.y !== 'number' || typeof position.z !== 'number') {
        logger.warn(`Player ${playerId} sent invalid position:`, position, '- keeping existing position');
        position = player.position; // Keep existing position
      }

      // Check if player fell out of bounds (below -200)
      if (position && position.y < -200) {
        player.state = PLAYER_STATES.DEAD;
        logger.info(`Player ${playerId} fell out of bounds (y=${position.y}), marked as dead`);
        return;
      }

      player.position = { ...position };
      player.rotation = { ...rotation };
      // ensure gaze is legal
      if (!gaze || typeof gaze.x !== 'number') {
        // use cureent player if no gaze，or a default forward vector
        gaze = player.gaze || { x: 0, y: 0, z: 1 };
      }

      // ensure rotation is legal
      if (!rotation) {
        rotation = player.rotation || { x: 0, y: 0, z: 0 };
      }

      // Normalize gaze vector
      const len = Math.sqrt(gaze.x * gaze.x + gaze.y * gaze.y + gaze.z * gaze.z);
      if (len > 0) {
        player.gaze = {
          x: gaze.x / len,
          y: gaze.y / len,
          z: gaze.z / len,
        };
      }
    }
  }


  /**
   * Execute a blink action for player (resets cooldown)
   */
  executeBlink(playerId, refreshSeconds) {
    const player = this.players.get(playerId);
    if (player) {
      player.lastBlinkTime = Date.now();
      logger.debug(`Player ${playerId} blinked, refresh: ${refreshSeconds}s`);
      return true;
    }
    return false;
  }


  /**
   * Spawn an orb at a specific location
   */
  spawnOrb(orbId, position) {
    this.orbs.set(orbId, {
      id: orbId,
      position: { ...position },
      value: ORB_SCORE_VALUE,
      collected: false,
      collectedBy: null,
      collectedTime: 0,
    });
  }

  /**
   * Spawn random orbs in the safe zone
   */
  spawnRandomOrbs(count) {
    for (let i = 0; i < count; i++) {
      const orbId = `orb_${Date.now()}_${i}`;
      const angle = Math.random() * Math.PI * 2;
      const distance = Math.random() * this.arenaSafeRadius;
      const x = this.centerX + Math.cos(angle) * distance;
      const z = this.centerZ + Math.sin(angle) * distance;

      this.spawnOrb(orbId, { x, y: 1, z });
    }
  }

  /**
   * Spawn a single obstacle
   */
  spawnObstacle(obstacleId, position, size) {
    const height = size.h || Math.max(4, Math.floor((size.w + size.d) / 3));
    this.obstacles.set(obstacleId, {
      id: obstacleId,
      position: { x: position.x, y: position.y || 0, z: position.z },
      width: size.w,
      depth: size.d,
      height,
    });
  }

  /**
   * Spawn random obstacles inside the safe zone
   */
  spawnRandomObstacles(count) {
    // Create clustered obstacles closer to center so they appear inside shrinking arena
    // Increase number of clusters (so less obstacles per cluster)
    const clusterCount = Math.max(2, Math.floor(count / 2));
    const perCluster = Math.ceil(count / clusterCount);

    // debug: log intent to spawn
    logger.debug(`Lobby ${this.lobbyId}: Spawning ${count} obstacles in ${clusterCount} clusters`);

    for (let c = 0; c < clusterCount; c++) {
      // cluster center scattered across more of the arena (up to 80% radius)
      const clusterAngle = Math.random() * Math.PI * 2;
      const clusterDist = Math.random() * (this.arenaSafeRadius * 0.8);
      const cx = this.centerX + Math.cos(clusterAngle) * clusterDist;
      const cz = this.centerZ + Math.sin(clusterAngle) * clusterDist;

      for (let i = 0; i < perCluster; i++) {
        const idx = c * perCluster + i;
        if (idx >= count) break;
        // generate safer unique id (include random suffix)
        const obstacleId = `obs_${Date.now()}_${c}_${i}_${Math.random().toString(36).slice(2, 8)}`;
        // place near cluster center within small jitter
        const angle = Math.random() * Math.PI * 2;
        // jitter each obstacle within a modest area around the cluster center
        const distance = Math.random() * (this.arenaSafeRadius * 0.18);
        const x = cx + Math.cos(angle) * distance;
        const z = cz + Math.sin(angle) * distance;
        const w = 4 + Math.floor(Math.random() * 6); // width between 4..9
        const d = 4 + Math.floor(Math.random() * 6); // depth between 4..9
        const h = 4 + Math.floor(Math.random() * 6); // height between 4..9
        this.spawnObstacle(obstacleId, { x, y: 0, z }, { w, d, h });
      }
    }
  }

  getActiveObstacles() {
    return Array.from(this.obstacles.values());
  }

  /**
   * Mark an orb as collected
   */
  collectOrb(orbId, playerId) {
    const orb = this.orbs.get(orbId);
    if (orb && !orb.collected) {
      orb.collected = true;
      orb.collectedBy = playerId;
      orb.collectedTime = Date.now();

      const player = this.players.get(playerId);
      if (player) {
        // If attached to another player (mutual), split points
        const otherId = player.attachedTo;
        if (otherId) {
          const other = this.players.get(otherId);
          if (other && other.attachedTo === playerId) {
            const total = orb.value;
            const half = Math.floor(total / 2);
            const rem = total - half;
            player.orbsCollected += 1;
            other.orbsCollected += 1;
            player.score += half;
            other.score += rem;
            return { split: true, results: [{ playerId, points: half }, { playerId: otherId, points: rem }] };
          }
        }

        // Default: give all to collector
        player.orbsCollected += 1;
        player.score += orb.value;
      }

      return { split: false, results: [{ playerId, points: orb.value }] };
    }
    return null;
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
  damagePlayer(playerId, damage) {
    const player = this.players.get(playerId);
    if (!player) return 0;

    if (player.health > 0) {
      player.health = Math.max(0, player.health - damage);
      player.lastAttackTime = Date.now();
    }

    if (player.health <= 0) {
      player.state = PLAYER_STATES.DEAD;
      logger.info(`Player ${playerId} died in lobby ${this.lobbyId}`);
    }

    return player.health || 0;
  }


  /**
   * Heal a player over time (called every regen interval)
   */
  regenPlayer(playerId, regenAmount) {
    const player = this.players.get(playerId);
    if (player && player.health > 0 && player.state === PLAYER_STATES.ALIVE) {
      player.health = Math.min(player.maxHealth, player.health + regenAmount);
      player.lastRegenTime = Date.now();
      return true;
    }
    return false;
  }

  /**
   * Spawn a monster at a location
   */
  spawnMonster(monsterId, position, behaviour) {
    logger.debug(`Monster ${monsterId} spawned in lobby ${this.lobbyId}`);

    // In GameState.spawnMonster
    this.monsters.set(monsterId, {
      id: monsterId,
      position: { ...position },
      velocity: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      gaze: { x: 0, y: 0, z: 1 }, // ensure default forward direction
      state: MONSTER_STATES.ROARING,
      health: CONFIG.MONSTER_MAX_HEALTH,
      maxHealth: CONFIG.MONSTER_MAX_HEALTH,
      targetPlayerId: null,
      behaviour,
      spawnTime: Date.now(),
      roarEndTime: Date.now() + CONFIG.MONSTER_ROAR_DURATION,
      immobileUntilTime: Date.now() + CONFIG.MONSTER_ROAR_IMMOBILE_TIME,
      nextAttackTime: Date.now() + CONFIG.MONSTER_ATTACK_COOLDOWN,
      lastSeenPlayerPosition: null,
      lastSightTime: 0,
      lastPathfindTime: 0,
      pathfindTarget: null,
      path: [],
      pathIndex: 0,
      frozenBy: [],
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
    logger.debug(`Monster ${monsterId} removed from lobby ${this.lobbyId}`);
    this.monsters.delete(monsterId);
  }

  /**
   * Mark monster as frozen by players looking at it
   */
  setMonsterFrozen(monsterId, frozenByPlayerIds) {
    const monster = this.monsters.get(monsterId);
    if (monster) {
      monster.frozenBy = frozenByPlayerIds;
      // Can't move if frozen
      if (frozenByPlayerIds.length > 0) {
        monster.velocity = { x: 0, y: 0, z: 0 };
      }
    }
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
   * Set player ready status
   */
  setPlayerReady(playerId, ready) {
    const player = this.players.get(playerId);
    if (player) {
      player.ready = ready;
    }
  }

  /**
   * Check if all players in lobby are ready
   */
  areAllPlayersReady() {
    if (this.players.size === 0) return false;
    for (const player of this.players.values()) {
      if (!player.ready) return false;
    }
    return true;
  }

  /**
   * Get players as array
   */
  getPlayers() {
    return Array.from(this.players.values());
  }

  /**
   * Calculate distance between two points
   */
  distance(p1, p2) {
    const dx = p2.x - p1.x;
    const dz = p2.z - p1.z;
    return Math.sqrt(dx * dx + dz * dz);
  }

  /**
   * Request attachment between two players (initiator points at target + presses V)
   */
  requestAttachment(fromPlayerId, toPlayerId) {
    const fromPlayer = this.players.get(fromPlayerId);
    const toPlayer = this.players.get(toPlayerId);

    if (!fromPlayer || !toPlayer) return false;
    if (fromPlayer.attachmentState !== ATTACHMENT_STATES.ALONE) return false;
    if (toPlayer.attachmentState !== ATTACHMENT_STATES.ALONE) return false;

    // Send request to target
    toPlayer.pairRequestFrom.push(fromPlayerId);
    fromPlayer.pairRequestPendingTo = toPlayerId;

    logger.debug(`Attachment request: ${fromPlayerId} -> ${toPlayerId}`);
    return true;
  }

  /**
   * Accept attachment (target presses V)
   */
  acceptAttachment(respondingPlayerId, requestingPlayerId) {
    const responding = this.players.get(respondingPlayerId);
    const requesting = this.players.get(requestingPlayerId);

    if (!responding || !requesting) return false;

    // Remove from pending requests
    responding.pairRequestFrom = responding.pairRequestFrom.filter(id => id !== requestingPlayerId);
    requesting.pairRequestPendingTo = null;

    // Both now attached back-to-back
    responding.attachedTo = requestingPlayerId;
    requesting.attachedTo = respondingPlayerId;
    responding.attachmentState = ATTACHMENT_STATES.ATTACHED;
    requesting.attachmentState = ATTACHMENT_STATES.ATTACHED;

    // By default, the responding (target) becomes the walking/controller
    responding.isControlling = true;
    requesting.isControlling = false;

    // Place the requesting player just behind the responding player
    try {
      const gaze = responding.gaze || { x: 0, y: 0, z: 1 };
      const backDist = CONFIG.ATTACH_BACK_DISTANCE || 0.4;
      requesting.position = {
        x: responding.position.x + gaze.x * backDist,
        y: CONFIG.PLAYER_HEIGHT,
        z: responding.position.z + gaze.z * backDist,
      };
      // Align requester rotation to face same direction
      //requesting.rotation = { ...responding.rotation };
    } catch (e) {
      logger.debug('Failed to position attached player behind target', e);
    }

    logger.info(`Players ${respondingPlayerId} and ${requestingPlayerId} are attached`);
    return true;
  }

  /**
   * Decline an attachment request (target presses X)
   */
  declineAttachment(respondingPlayerId, requestingPlayerId) {
    const responding = this.players.get(respondingPlayerId);
    const requesting = this.players.get(requestingPlayerId);

    if (responding) {
      responding.pairRequestFrom = responding.pairRequestFrom.filter(id => id !== requestingPlayerId);
    }
    if (requesting) {
      requesting.pairRequestPendingTo = null;
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

    logger.debug(`Players ${playerId} and ${otherPlayerId} detached`);
  }

  /**
   * Get nearby players within a radius for broadcasts
   */
  getNearbyPlayers(fromPlayerId, radius) {
    const fromPlayer = this.players.get(fromPlayerId);
    if (!fromPlayer) return [];

    return Array.from(this.players.values()).filter(p => {
      if (p.id === fromPlayerId) return false;
      const distance = this.distance(fromPlayer.position, p.position);
      return distance <= radius;
    });
  }

  /**
   * Get players that can see this player (cone of gaze)
   */
  getPlayersWhoCanSee(targetPlayerId, maxDistance = 100) {
    const target = this.players.get(targetPlayerId);
    if (!target) return [];

    const viewers = [];

    for (const [id, player] of this.players) {
      if (id === targetPlayerId) continue;

      const dist = this.distance(player.position, target.position);
      if (dist > maxDistance) continue;

      // Check if target is in player's gaze cone
      const dx = target.position.x - player.position.x;
      const dz = target.position.z - player.position.z;
      const dirLen = Math.sqrt(dx * dx + dz * dz);

      if (dirLen === 0) continue;

      const dx_norm = dx / dirLen;
      const dz_norm = dz / dirLen;

      const dotProduct = player.gaze.x * dx_norm + player.gaze.z * dz_norm;
      const angle = Math.acos(Math.max(-1, Math.min(1, dotProduct)));

      if (angle <= CONFIG.GAZE_RAYCAST_CONE_ANGLE) {
        viewers.push(player);
      }
    }

    return viewers;
  }

  /**
   * Get the current state of the game
   */
  getState() {
    return {
      players: Array.from(this.players.values()),
      monsters: Array.from(this.monsters.values()),
      orbs: Array.from(this.orbs.values()),
      obstacles: Array.from(this.obstacles.values()),
      arena: {
        centerX: this.centerX,
        centerZ: this.centerZ,
        safeRadius: this.arenaSafeRadius,
      },
      matchStartTime: this.matchStartTime,
      active: this.active,
    };
  }
}

module.exports = { GameState, PLAYER_STATES, MONSTER_STATES, ATTACHMENT_STATES };
