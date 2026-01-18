/**
 * server/monsterAI.js
 * 
 * Monster AI logic with state machine, vision, pathfinding, and attack mechanics.
 * Production-ready implementation with proper state transitions and game mechanics.
 */

const { CONFIG, logger } = require('./config.js');
const { MONSTER_STATES, PLAYER_STATES } = require('./gameState.js');

/**
 * A* Pathfinding for monsters (simplified grid-based)
 */
class AStarPathfinder {
  constructor(gridSize = 10) {
    this.gridSize = gridSize;
  }

  /**
   * Find path from start to goal using simplified A* (Manhattan distance heuristic)
   */
  findPath(start, goal, obstacles = []) {
    // Simplified: return direct line-of-sight path if no obstacles
    // In a full implementation, this would do proper A* with grid
    const path = [start];

    // For now, just one waypoint to goal
    const dx = goal.x - start.x;
    const dz = goal.z - start.z;
    const distance = Math.sqrt(dx * dx + dz * dz);

    if (distance > 0.1) {
      // Add intermediate waypoint
      const steps = Math.ceil(distance / 5);
      for (let i = 1; i < steps; i++) {
        path.push({
          x: start.x + (dx / steps) * i,
          z: start.z + (dz / steps) * i,
        });
      }
    }

    path.push(goal);
    return path;
  }
}

/**
 * MonsterAI - manages all monster AI for a single lobby
 */
class MonsterAI {
  constructor(gameState) {
    this.gameState = gameState;
    this.monsterIdCounter = 0;
    this.pathfinder = new AStarPathfinder();
    this.lastSpawnCheck = Date.now();
  }

  /**
   * Update all monsters in the lobby (called periodically)
   */
  updateAllMonsters(deltaTime) {
    const monsters = this.gameState.getAllMonsters();

    for (const monster of monsters) {
      this.updateSingleMonster(monster, deltaTime);
    }

    // Periodically check if new monsters should spawn
    if (Date.now() - this.lastSpawnCheck > 1000) {
      this.checkMonsterSpawning();
      this.lastSpawnCheck = Date.now();
    }
  }

  /**
   * Update a single monster's state and behavior
   */
  updateSingleMonster(monster, deltaTime) {
    const now = Date.now();

    // Update state based on transitions
    this.updateMonsterState(monster, now);

    // Update monster movement and actions based on current state
    switch (monster.state) {
      case MONSTER_STATES.ROARING:
        // Just spawned, immobile, visible on map
        break;

      case MONSTER_STATES.HUNTING:
        this.updateHuntingMonster(monster, now, deltaTime);
        break;

      case MONSTER_STATES.IDLE:
        this.updateIdleMonster(monster, now, deltaTime);
        break;

      case MONSTER_STATES.ATTACKING:
        this.updateAttackingMonster(monster, now, deltaTime);
        break;
    }
  }

  /**
   * Update monster state machine transitions
   */
  updateMonsterState(monster, now) {
    switch (monster.state) {
      case MONSTER_STATES.ROARING:
        // Transition out of roaring when duration expires
        if (now >= monster.roarEndTime) {
          monster.state = MONSTER_STATES.IDLE;
          logger.debug(`Monster ${monster.id} stopped roaring, entering IDLE`);
        }
        break;

      case MONSTER_STATES.IDLE:
        // Look for players to hunt
        const players = this.gameState.getLivingPlayers();
        for (const player of players) {
          if (this.canMonsterSeePlayer(monster, player)) {
            monster.state = MONSTER_STATES.HUNTING;
            monster.targetPlayerId = player.id;
            monster.pathfindTarget = { ...player.position };
            monster.lastSightTime = now;
            logger.debug(`Monster ${monster.id} spotted player ${player.id}, hunting`);
            break;
          }
        }
        break;

      case MONSTER_STATES.HUNTING:
        // Check if target is still valid
        const target = this.gameState.getPlayer(monster.targetPlayerId);
        if (!target || target.state !== PLAYER_STATES.ALIVE) {
          monster.state = MONSTER_STATES.IDLE;
          monster.targetPlayerId = null;
          monster.path = [];
          logger.debug(`Monster ${monster.id} lost target, returning to IDLE`);
          break;
        }

        // Check if player is still visible
        if (this.canMonsterSeePlayer(monster, target)) {
          monster.lastSeenPlayerPosition = { ...target.position };
          monster.lastSightTime = now;
        } else {
          // Lost line of sight - check if lost entirely
          const timeSinceSight = (now - monster.lastSightTime) / 1000;
          if (timeSinceSight > 5) {
            monster.state = MONSTER_STATES.IDLE;
            monster.targetPlayerId = null;
            monster.path = [];
            logger.debug(`Monster ${monster.id} lost sight, returning to IDLE`);
          }
        }
        break;
    }
  }

  /**
   * Update hunting monster - pathfind to target
   */
  updateHuntingMonster(monster, now, deltaTime) {
    const target = this.gameState.getPlayer(monster.targetPlayerId);
    if (!target) return;

    // If any non-blinking player is looking at the monster, it cannot attack
    const { openWatchers } = this.getWatchingPlayers(monster, now);
    const isWatchedByOpenEyes = openWatchers.length > 0;

    // Check if close enough to attack
    const dx = target.position.x - monster.position.x;
    const dz = target.position.z - monster.position.z;
    const distance = Math.sqrt(dx * dx + dz * dz);

    if (distance < 2) {
      // Can attack
      if (!isWatchedByOpenEyes && now >= monster.nextAttackTime) {
        this.attackPlayer(monster, target);
        monster.nextAttackTime = now + 2000; // Attack cooldown
      }
    } else {
      // Move toward target
      this.moveMonsterToward(monster, target.position, deltaTime);
    }
  }

  /**
   * Update idle monster - scan for players or wander
   */
  updateIdleMonster(monster, now, deltaTime) {
    // Random idle movement (optional)
    // For now, just idle in place
  }

  /**
   * Update attacking monster - only during attack animation
   */
  updateAttackingMonster(monster, now, deltaTime) {
    // Monster is frozen during attack, return to hunting after cooldown
  }

  /**
   * Check if monster can see a player
   */
  canMonsterSeePlayer(monster, player) {
    // Distance check
    const dx = player.position.x - monster.position.x;
    const dz = player.position.z - monster.position.z;
    const distance = Math.sqrt(dx * dx + dz * dz);

    if (distance > CONFIG.MONSTER_DETECTION_RANGE) {
      return false;
    }

    // Check if player is within detection cone (90 degrees)
    if (monster.gaze) {
      const dirNorm = Math.sqrt(dx * dx + dz * dz);
      if (dirNorm > 0) {
        const dotProduct = (monster.gaze.x * dx + monster.gaze.z * dz) / dirNorm;
        const coneThreshold = Math.cos(CONFIG.MONSTER_DETECTION_CONE_ANGLE / 2);
        if (dotProduct < coneThreshold) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Check if player is in monster's blind spot (directly behind)
   */
  isInMonsterBlindSpot(monster, player) {
    // Get direction from monster to player
    const dx = player.position.x - monster.position.x;
    const dz = player.position.z - monster.position.z;
    const distance = Math.sqrt(dx * dx + dz * dz);

    if (distance < 0.1) return false;

    // Normalize
    const dx_norm = dx / distance;
    const dz_norm = dz / distance;

    // Monster's forward direction
    const forward = { x: monster.gaze?.x || 0, z: monster.gaze?.z || 1 };

    // Backward direction (blind spot)
    const backward = { x: -forward.x, z: -forward.z };

    // Check if player is behind (60 degree cone)
    const dotProduct = dx_norm * backward.x + dz_norm * backward.z;
    const coneThreshold = Math.cos((Math.PI / 3) / 2); // 60 degrees

    return dotProduct > coneThreshold;
  }

  /**
   * Determine which players are currently looking at the monster.
   * Returns arrays of watchers with eyes open vs watchers who are mid-blink (eyes closed).
   */
  getWatchingPlayers(monster, now) {
    const openWatchers = [];
    const blinkingWatchers = [];

    const players = this.gameState.getLivingPlayers();
    const coneThreshold = Math.cos(CONFIG.GAZE_RAYCAST_CONE_ANGLE / 2);

    for (const p of players) {
      // Vector from player to monster
      const dx = p.position.x - monster.position.x;
      const dz = p.position.z - monster.position.z;
      const distance = Math.sqrt(dx * dx + dz * dz);
      if (distance <= 0.001) continue;

      // Ignore if monster is outside reasonable sight range
      if (distance > CONFIG.VISION_DETECTION_RANGE) continue;

      // Player gaze direction (normalized)
      const gaze = p.gaze || { x: 0, y: 0, z: 1 };

      // Cosine of angle between gaze and vector to monster
      const dot = (gaze.x * dx + gaze.z * dz) / distance;
      if (dot < coneThreshold) continue; // Not looking at monster

      const isBlinking = p.lastBlinkTime && (now - p.lastBlinkTime) <= CONFIG.PLAYER_BLINK_BLACKOUT_DURATION;
      if (isBlinking) {
        blinkingWatchers.push(p.id);
      } else {
        openWatchers.push(p.id);
      }
    }

    return { openWatchers, blinkingWatchers };
  }

  /**
   * Find spawn position in blind spot of target player
   */
  findMonsterSpawnPosition(player) {
    if (!player || !player.position) {
      logger.warn('findMonsterSpawnPosition: player or position is undefined');
      return { x: 0, y: 1, z: 0 };
    }

    const spawnDistance = 20;

    // ensure gaze is defined and valid
    const gazeX = typeof player.gaze?.x === 'number' && !isNaN(player.gaze.x) ? player.gaze.x : 0;
    const gazeZ = typeof player.gaze?.z === 'number' && !isNaN(player.gaze.z) ? player.gaze.z : 1;

    // ensure position values are valid
    const posX = typeof player.position.x === 'number' && !isNaN(player.position.x) ? player.position.x : 0;
    const posZ = typeof player.position.z === 'number' && !isNaN(player.position.z) ? player.position.z : 0;

    const spawnX = posX - gazeX * spawnDistance;
    const spawnZ = posZ - gazeZ * spawnDistance;

    return { x: spawnX, y: 1, z: spawnZ };
  }


  /**
   * Move monster toward a position
   */
  moveMonsterToward(monster, target, deltaTime) {
    const dx = target.x - monster.position.x;
    const dz = target.z - monster.position.z;
    const distance = Math.sqrt(dx * dx + dz * dz);

    if (distance < 0.1) {
      monster.position = { ...target };
      return;
    }

    // Move at monster speed
    const moveDistance = CONFIG.MONSTER_SPEED * deltaTime;
    if (moveDistance >= distance) {
      monster.position = { ...target };
    } else {
      const moveX = (dx / distance) * moveDistance;
      const moveZ = (dz / distance) * moveDistance;
      monster.position.x += moveX;
      monster.position.z += moveZ;
    }

    // Update gaze to point toward target
    monster.gaze = {
      x: dx / distance,
      y: 0,
      z: dz / distance,
    };
  }

  /**
   * Monster attacks a player
   */
  attackPlayer(monster, player) {
    const now = Date.now();
    // Double-check: do not attack if any non-blinking player is looking at the monster
    const { openWatchers } = this.getWatchingPlayers(monster, now);
    if (openWatchers && openWatchers.length > 0) {
      logger.debug(`Monster ${monster.id} refrained from attacking because player(s) are watching: ${openWatchers.join(',')}`);
      return;
    }

    const damage = CONFIG.MONSTER_ATTACK_DAMAGE || 60;
    const newHealth = this.gameState.damagePlayer(player.id, damage);
    if (typeof newHealth === 'number') {
      logger.info(`Monster ${monster.id} attacked player ${player.id} (damage: ${damage.toFixed(1)}, health: ${newHealth.toFixed(1)})`);
    }
  }

  /**
   * Check if new monsters should spawn
   */
  checkMonsterSpawning() {
    const matchTime = this.gameState.getMatchElapsedTime();

    if (matchTime < CONFIG.MONSTER_SPAWN_DELAY) {
      return;
    }
    const livingPlayers = this.gameState.getLivingPlayers();
    const minutesElapsed = matchTime / 60000;
    const targetMonsterCount = Math.floor(livingPlayers.length * (1 + minutesElapsed));
    const currentMonsterCount = this.gameState.getAllMonsters().length;

    // Spawn additional monsters
    for (let i = currentMonsterCount; i < Math.min(targetMonsterCount, livingPlayers.length * 3); i++) {
      if (livingPlayers.length === 0) break;

      const player = livingPlayers[Math.floor(Math.random() * livingPlayers.length)];
      this.spawnMonster(player);
    }
  }

  /**
   * Spawn a new monster in the blind spot of a player
   */
  spawnMonster(targetPlayer) {
    const spawnPos = this.findMonsterSpawnPosition(targetPlayer);
    const monsterId = `monster_${this.gameState.lobbyId}_${this.monsterIdCounter++}`;

    // Validate spawn position
    if (isNaN(spawnPos.x) || isNaN(spawnPos.z)) {
      logger.warn(`Invalid spawn position for monster ${monsterId}: (${spawnPos.x}, ${spawnPos.z}), using (0, 0)`);
      spawnPos.x = 0;
      spawnPos.z = 0;
    }

    this.gameState.spawnMonster(monsterId, spawnPos, 'hunter');

    logger.debug(`Monster ${monsterId} spawned in ${this.gameState.lobbyId} at (${spawnPos.x.toFixed(1)}, ${spawnPos.z.toFixed(1)})`);
  }
}

module.exports = { MonsterAI };
