/**
 * server/config.js
 * Centralized server configuration for game balance, arena, and networking.
 * Production-ready game development best practices: single source of truth for all tunable parameters.
 */

const CONFIG = {
  // ==================== SERVER ====================
  PORT: process.env.PORT || 3000,
  HOST: '0.0.0.0', // Listen on all interfaces for LAN/WAN play
  MAX_LOBBIES: 10,
  PLAYERS_PER_LOBBY: 8,

  // ==================== ARENA ====================
  ARENA_RADIUS: 100,
  ARENA_HEIGHT: 150,
  ARENA_SHRINK_START_TIME: 120000, // 2 minutes before shrink begins
  ARENA_SHRINK_DURATION: 60000, // Takes 1 minute to fully shrink
  ARENA_FINAL_RADIUS: 10,
  OBSTACLE_COUNT: 15,
  ORB_COUNT_INITIAL: 75,
  ORB_SPAWN_INTERVAL: 5000, // New orbs spawn every 5s to maintain count

  // ==================== PLAYER MECHANICS ====================
  PLAYER_SPEED: 25, // units/second forward
  PLAYER_BACKWARD_SPEED_MULTIPLIER: 0.5, // Backward is 50% speed
  PLAYER_HEIGHT: 1.8,
  PLAYER_MAX_HEALTH: 100,
  PLAYER_REGEN_AMOUNT: 1, // Health per regen tick
  PLAYER_REGEN_INTERVAL: 5000, // Regen every 5 seconds
  PLAYER_BLINK_MAX_TIME: 20000, // Forced blink after 20s of staring
  PLAYER_BLINK_VOLUNTARY_REFRESH: 10000, // Voluntary blink adds 10s
  PLAYER_BLINK_BLACKOUT: 500, // Screen blackout duration (ms)

  // ==================== MONSTER MECHANICS ====================
  MONSTER_SPAWN_DELAY: 30000, // First monster spawns after 30s
  MONSTER_SPAWN_RATE: 1, // 1 per living player per minute
  MONSTER_ROAR_DURATION: 10000, // Visible on minimap for 10s
  MONSTER_ROAR_IMMOBILE_TIME: 3000, // Can't move for first 3s after roar
  MONSTER_ATTACK_DAMAGE_PERCENT: 0.6, // 60% of max health
  MONSTER_DETECTION_RANGE: 30, // Sees player within 30m
  MONSTER_HUNT_RANGE: 50, // Stops hunting if player > 50m away
  MONSTER_SPEED: 20, // units/second pathfinding speed
  MONSTER_PATHFIND_UPDATE_INTERVAL: 1000, // Recalculate path every 1s
  MONSTER_DETECTION_CONE_ANGLE: Math.PI / 2, // 90 degree detection cone

  // ==================== VISION & GAZE ====================
  GAZE_RAYCAST_DISTANCE: 1000,
  GAZE_RAYCAST_CONE_ANGLE: Math.PI / 3, // 60 degree gaze cone
  MINIMAP_VISIBLE_RANGE: 50,

  // ==================== ORBS ====================
  ORB_COLLECTION_RANGE: 5, // meters to collect
  ORB_RESPAWN_TIMER: 3000, // Collected orbs become available again after 3s

  // ==================== PAIRING/ATTACHMENT ====================
  PAIR_REQUEST_TIMEOUT: 10000, // Pair request expires after 10s
  PAIR_BROADCAST_RANGE: 30, // Distance for pair broadcasts
  PAIR_SWAP_CONTROL_REQUEST_TIMEOUT: 10000,

  // ==================== UPDATE RATES ====================
  GAME_LOOP_RATE: 60, // Hz (server game loop)
  NETWORK_UPDATE_RATE: 30, // Hz (network broadcasts)
  MONSTER_AI_UPDATE_RATE: 10, // Hz (monster pathfinding)
  PLAYER_REGEN_RATE: 0.2, // Hz (health regen)

  // ==================== LOGGING & DEBUG ====================
  DEBUG_MODE: process.env.DEBUG === 'true',
  LOG_LEVEL: process.env.LOG_LEVEL || 'info', // 'debug', 'info', 'warn', 'error'
};

/**
 * Logger utility with levels
 */
class Logger {
  log(level, message, data = null) {
    if (CONFIG.DEBUG_MODE || level !== 'debug') {
      const timestamp = new Date().toISOString();
      const prefix = `[${timestamp}] [${level.toUpperCase()}]`;
      if (data) {
        console.log(`${prefix} ${message}`, data);
      } else {
        console.log(`${prefix} ${message}`);
      }
    }
  }

  debug(message, data) {
    this.log('debug', message, data);
  }

  info(message, data) {
    this.log('info', message, data);
  }

  warn(message, data) {
    this.log('warn', message, data);
  }

  error(message, data) {
    this.log('error', message, data);
  }
}

const logger = new Logger();

module.exports = { CONFIG, logger };
