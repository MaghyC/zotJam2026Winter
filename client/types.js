/**
 * shared/types.js
 * 
 * Type definitions, enums, and constants shared between client and server.
 * This file documents the structure of all game objects and network messages.
 */

// ==================== ENUMS ====================

const PLAYER_STATES = {
  ALIVE: 'alive',
  DEAD: 'dead',
  SPECTATING: 'spectating',
};

const MONSTER_STATES = {
  ROARING: 'roaring', // Just spawned, immobile, visible on map
  IDLE: 'idle', // Wandering, looking for targets
  HUNTING: 'hunting', // Chasing a player
  ATTACKING: 'attacking', // Attacking nearby player
  DEAD: 'dead',
};

const ATTACHMENT_STATES = {
  ALONE: 'alone',
  REQUEST_SENT: 'request_sent', // Waiting for response
  REQUEST_RECEIVED: 'request_received',
  ATTACHED: 'attached', // Successfully paired back-to-back
};

// ==================== GAME CONSTANTS ====================

const GAME_CONSTANTS = {
  // Arena
  ARENA_RADIUS: 100,
  ARENA_HEIGHT: 150,
  ARENA_SHRINK_START_TIME: 120000, // 2 minutes
  ARENA_SHRINK_DURATION: 60000, // 1 minute to shrink
  ARENA_FINAL_RADIUS: 10,

  // Player
  PLAYER_MAX_HEALTH: 100,
  PLAYER_REGEN_AMOUNT: 1,
  PLAYER_REGEN_INTERVAL: 5000,
  PLAYER_SPEED: 25,
  PLAYER_BACKWARD_SPEED_MULTIPLIER: 0.5,
  PLAYER_HEIGHT: 1.8,

  // Blink
  PLAYER_BLINK_MAX_TIME: 20000, // 20 seconds before forced blink
  PLAYER_BLINK_VOLUNTARY_REFRESH: 10000, // Voluntary blink adds 10s
  PLAYER_BLINK_BLACKOUT: 500, // Screen blackout duration

  // Monster
  MONSTER_SPAWN_DELAY: 30000, // First spawn at 30s
  MONSTER_SPAWN_RATE: 1, // 1 per living player per minute
  MONSTER_ROAR_DURATION: 10000,
  MONSTER_ROAR_IMMOBILE_TIME: 3000,
  MONSTER_ATTACK_DAMAGE_PERCENT: 0.6, // 60% of max health
  MONSTER_DETECTION_RANGE: 30,
  MONSTER_SPEED: 20,

  // Vision/Gaze
  GAZE_RAYCAST_DISTANCE: 1000,
  GAZE_RAYCAST_CONE_ANGLE: Math.PI / 3, // 60 degrees
  MINIMAP_VISIBLE_RANGE: 50,

  // Orbs
  ORB_COLLECTION_RANGE: 5,
  ORB_SCORE_VALUE: 1,
  ORB_COUNT_INITIAL: 75,
  ORB_SPAWN_INTERVAL: 5000,

  // Pairing
  PAIR_REQUEST_TIMEOUT: 10000,
  PAIR_BROADCAST_RANGE: 30,
};

// ==================== TYPE DEFINITIONS ====================

/**
 * Vector3 - 3D point or direction
 * @typedef {Object} Vector3
 * @property {number} x
 * @property {number} y  
 * @property {number} z
 */

/**
 * Player - represents a player in the game
 * @typedef {Object} Player
 * @property {string} id - unique player identifier (socket.id)
 * @property {string} username - player name
 * @property {string} state - ALIVE | DEAD | SPECTATING
 * @property {Vector3} position - 3D position in arena
 * @property {Vector3} rotation - rotation (pitch, yaw, roll in radians)
 * @property {Vector3} gaze - normalized direction vector (forward = Z)
 * @property {number} health - current health (0-maxHealth)
 * @property {number} maxHealth - max health (100)
 * @property {number} score - total orbs collected
 * @property {number} orbsCollected - count of orbs
 * @property {string|null} attachedTo - player id if paired, else null
 * @property {string} attachmentState - ALONE | ATTACHED | REQUEST_SENT | REQUEST_RECEIVED
 * @property {number} lastAttackTime - ms of last monster hit
 */

/**
 * Orb - collectible power-up/points
 * @typedef {Object} Orb
 * @property {string} id - unique identifier
 * @property {Vector3} position - 3D position
 * @property {number} value - score value (1)
 * @property {boolean} collected - whether already taken
 */

/**
 * Monster - AI-controlled enemy
 * @typedef {Object} Monster
 * @property {string} id - unique identifier
 * @property {Vector3} position - current position
 * @property {Vector3} rotation - facing direction
 * @property {Vector3} gaze - movement direction
 * @property {string} state - ROARING | IDLE | HUNTING | ATTACKING | DEAD
 * @property {number} health - current health
 * @property {number} maxHealth - max health (50)
 * @property {string|null} targetPlayerId - who it's hunting (null if idle)
 * @property {number[]} frozenBy - list of player ids looking at this monster
 * @property {number} roarEndTime - ms when roar animation ends
 * @property {number} immobileUntilTime - ms when it can move again
 */

/**
 * GameState - sent to clients for rendering
 * @typedef {Object} GameState
 * @property {string} lobbyCode - 4-char code for lobby (e.g., "AB12")
 * @property {boolean} active - match is running
 * @property {number} matchTime - seconds elapsed
 * @property {Player[]} players - all players in lobby
 * @property {Monster[]} monsters - all monsters spawned
 * @property {Orb[]} orbs - all uncollected orbs
 * @property {number} arenaSafeRadius - current safe zone radius
 */

// ==================== NETWORK MESSAGES ====================

const NETWORK_MESSAGES = {
  // Client -> Server
  JOIN_LOBBY: 'join_lobby',
  PLAYER_INPUT: 'player_input',
  BLINK_ACTION: 'blink_action',
  COLLECT_ORB: 'collect_orb',
  ATTACH_REQUEST: 'attach_request',
  ATTACH_RESPONSE: 'attach_response',
  DETACH: 'detach',
  BROADCAST_TIMER: 'broadcast_timer',

  // Server -> Client
  STATE_UPDATE: 'state_update',
  PLAYER_JOINED: 'player_joined',
  PLAYER_LEFT: 'player_left',
  ORB_COLLECTED: 'orb_collected',
  BLINK_ACTION: 'blink_action',
  BLINK_RESPONSE: 'blink_response',
  ATTACH_REQUEST: 'attach_request',
  ATTACH_RESPONSE: 'attach_response',
  ATTACH_ACCEPTED: 'attach_accepted',
  ATTACH_DECLINED: 'attach_declined',
  PLAYER_DETACHED: 'player_detached',
  TIMER_BROADCAST: 'timer_broadcast',
  MATCH_START: 'match_start',
  MATCH_END: 'match_end',
  ERROR: 'error',
};

// ==================== EXPORTS ====================

if (typeof module !== 'undefined' && module.exports) {
  // Node.js
  module.exports = {
    PLAYER_STATES,
    MONSTER_STATES,
    ATTACHMENT_STATES,
    GAME_CONSTANTS,
    NETWORK_MESSAGES,
  };
} else {
  // Browser
  window.GAME_TYPES = {
    PLAYER_STATES,
    MONSTER_STATES,
    ATTACHMENT_STATES,
    GAME_CONSTANTS,
    NETWORK_MESSAGES,
  };
}

/**
 * JSDoc Type Definitions (for IDE intellisense only, not runtime)
 * 
 * @typedef {Object} Vector3
 * @property {number} x
 * @property {number} y
 * @property {number} z
 * 
 * @typedef {Object} Player
 * @property {string} id - player ID
 * @property {string} username - player name
 * @property {Vector3} position
 * @property {Object} rotation - pitch/yaw for camera
 * @property {Vector3} gaze - normalized facing direction
 * @property {number} health
 * @property {number} score
 * @property {string} state - from PLAYER_STATES
 * @property {string} attachmentState - from ATTACHMENT_STATES
 * 
 * @typedef {Object} Monster
 * @property {string} id - unique monster ID
 * @property {Vector3} position
 * @property {number} health
 * @property {string} state - from MONSTER_STATES
 * 
 * @typedef {Object} Orb
 * @property {string} id - unique orb ID
 * @property {Vector3} position
 * @property {number} points - 1 point per orb
 */
