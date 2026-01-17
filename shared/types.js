/**
 * shared/types.js
 * 
 * Type definitions and enums shared between client and server.
 * This helps document the structure of game objects.
 */

/**
 * Vector3 - represents a 3D point or direction
 * @typedef {Object} Vector3
 * @property {number} x
 * @property {number} y
 * @property {number} z
 */

/**
 * Player object - represents a player in the game
 * @typedef {Object} Player
 * @property {string} id - unique player identifier (socket id)
 * @property {string} name - player username
 * @property {Vector3} position - player's 3D position in the arena
 * @property {Vector3} rotation - player's rotation (pitch, yaw, roll in radians)
 * @property {Vector3} gaze - normalized direction vector the player is looking (used for blind spot calculations)
 * @property {number} health - current health (0 to maxHealth)
 * @property {number} maxHealth - maximum health (100 typically)
 * @property {string} state - player state (ALIVE, DEAD, RESPAWNING)
 * @property {number} score - accumulated points from collected orbs
 * @property {number} blinkCooldownEnd - server time when blink cooldown expires (milliseconds)
 * @property {string|null} attachedTo - player ID if attached back-to-back to another player
 * @property {string} attachmentState - current attachment state (ALONE, ATTACHED, etc.)
 * @property {number} lastAttackTime - timestamp of last monster attack on this player
 */

/**
 * Orb object - represents a collectible power-up
 * @typedef {Object} Orb
 * @property {string} id - unique orb identifier
 * @property {Vector3} position - 3D position in arena
 * @property {number} value - score value when collected (typically 10)
 * @property {boolean} collected - whether this orb has been collected
 */

/**
 * Monster object - AI-controlled enemy
 * @typedef {Object} Monster
 * @property {string} id - unique monster identifier
 * @property {Vector3} position - current 3D position
 * @property {Vector3} targetPosition - where the monster is moving toward
 * @property {Vector3} gaze - direction monster is "facing"
 * @property {number} health - current health
 * @property {number} maxHealth - maximum health
 * @property {string} state - monster state (ROARING, IDLE, HUNTING, LOST)
 * @property {string|null} targetPlayerId - player ID being hunted (null if IDLE/LOST)
 * @property {number} spawnTime - server timestamp when monster was spawned
 * @property {number} nextAttackTime - server timestamp when next attack is allowed
 * @property {Vector3} lastSeenPlayerPosition - last known position of hunted player
 * @property {number} lastSightTime - when the monster last saw the targeted player
 */

/**
 * Lobby object - represents a game session
 * @typedef {Object} Lobby
 * @property {string} id - unique lobby identifier
 * @property {string[]} playerIds - array of player IDs currently in lobby
 * @property {boolean} active - whether the match is running
 * @property {number} startTime - server timestamp when match started
 * @property {number} endTime - server timestamp when match ends (or 0 if still running)
 * @property {Orb[]} orbs - all orbs in this lobby
 * @property {Monster[]} monsters - all active monsters in this lobby
 * @property {number} arenaSafeRadius - current safe zone radius (shrinks over time)
 * @property {Object} gameState - additional game state (time elapsed, phase, etc.)
 */

/**
 * Network Message format - all socket.io messages follow this
 * @typedef {Object} NetworkMessage
 * @property {string} type - message type (from MESSAGE_TYPES)
 * @property {*} payload - data for this message type (varies by type)
 * @property {number} timestamp - server timestamp for synchronization
 */

/**
 * Attachment Request - sent when player tries to attach
 * @typedef {Object} AttachmentRequest
 * @property {string} from - player ID making the request
 * @property {string} to - player ID being requested
 * @property {number} timestamp - when request was made
 */

/**
 * Control Request - sent when attached player wants to control movement
 * @typedef {Object} ControlRequest
 * @property {string} from - player ID requesting control
 * @property {string} to - attached partner's ID
 * @property {number} timestamp - when request was made
 */

// Export these as a namespace for type hints
export const Types = {
  Vector3: {},
  Player: {},
  Orb: {},
  Monster: {},
  Lobby: {},
  NetworkMessage: {},
  AttachmentRequest: {},
  ControlRequest: {},
};
