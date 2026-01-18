/**
 * server/config.js
 * 
 * Centralized configuration and logging system for the game server.
 * All magic numbers and tunable parameters are defined here.
 */

// ==================== LOGGER ====================

class Logger {
    constructor(name = 'Game') {
        this.name = name;
    }

    _format(level, message, data = null) {
        const timestamp = new Date().toISOString();
        const dataStr = data ? ` ${JSON.stringify(data)}` : '';
        return `[${timestamp}] [${level}] ${message}${dataStr}`;
    }

    debug(message, data) {
        if (process.env.DEBUG === 'true') {
            console.log(this._format('DEBUG', message, data));
        }
    }

    info(message, data) {
        console.log(this._format('INFO', message, data));
    }

    warn(message, data) {
        console.warn(this._format('WARN', message, data));
    }

    error(message, data) {
        console.error(this._format('ERROR', message, data));
    }
}

// ==================== CONFIGURATION ====================

const CONFIG = {
    // Server
    HOST: '0.0.0.0',
    PORT: 3000,

    // Game Loop
    GAME_LOOP_RATE: 60,           // Server ticks per second
    NETWORK_UPDATE_RATE: 30,       // Network broadcasts per second

    // Arena
    ARENA_RADIUS: 100,             // Starting arena radius
    ARENA_HEIGHT: 150,             // Wall height
    ARENA_SHRINK_START_TIME: 120000, // Start shrinking at 2 minutes (ms)
    ARENA_SHRINK_DURATION: 60000,  // Shrink over 1 minute (ms)
    ARENA_FINAL_RADIUS: 10,        // Final shrunk radius
    ARENA_OUTSIDE_DAMAGE_PER_SECOND: 5, // Damage per second outside safe zone

    // Player
    PLAYERS_PER_LOBBY: 8,          // Max players in one lobby
    MAX_LOBBIES: 10,               // Max concurrent lobbies
    PLAYER_MAX_HEALTH: 100,        // Max health
    PLAYER_REGEN_AMOUNT: 1,        // HP per regen tick
    PLAYER_REGEN_INTERVAL: 5000,   // Regen every 5 seconds (ms)
    PLAYER_SPEED: 25,              // Units per second forward
    PLAYER_BACKWARD_SPEED_MULTIPLIER: 0.5, // 50% speed backward
    PLAYER_HEIGHT: 1.6,            // Player height

    // Blink Mechanic
    PLAYER_BLINK_MAX_TIME: 15000,  // 15 seconds forced blink (ms)
    PLAYER_BLINK_ADD_VOLUNTARY: 10000, // +10s for voluntary blink (ms)
    PLAYER_BLINK_BLACKOUT_DURATION: 500, // 0.5s can't see (ms)

    // Monster
    MONSTER_MAX_HEALTH: 50,        // Monster health
    MONSTER_SPEED: 200,             // Units per second
    MONSTER_ATTACK_COOLDOWN: 1500, // 1.5s between attacks (ms)
    MONSTER_ATTACK_DAMAGE: 60, // 60of player max health
    MONSTER_DETECTION_RANGE: 8000,   // Detection range (units)
    MONSTER_DETECTION_CONE_ANGLE: 0.6, // ~70 degrees
    MONSTER_BLIND_SPOT_ANGLE: 0.2, // ~22 degrees
    MONSTER_SPAWN_DELAY: 30000,    // Wait 30s before first spawn (ms)
    MONSTER_SPAWN_RATE: 1,         // Spawn rate multiplier (1 per living player per minute)
    // Monster roar timings for GameState.spawnMonster
    MONSTER_ROAR_DURATION: 2000,      // 2s roar duration
    MONSTER_ROAR_IMMOBILE_TIME: 2000, // immobile during entire roar

    // Vision
    VISION_DETECTION_RANGE: 10000,    // How far monsters can see
    VISION_CONE_ANGLE: 0.6,        // Vision cone angle
    BLIND_SPOT_CONE_ANGLE: 0.2,    // Blind spot cone angle
    GAZE_RAYCAST_CONE_ANGLE: 0.6,        // Vision raycast cone angle

    // Orbs
    ORB_COUNT_INITIAL: 75,           // Initial orbs
    ORB_RESPAWN_INTERVAL: 5000,    // Respawn collected orbs every 5s (ms)
    ORB_POINTS_PER_ORB: 1,         // Points for collecting

    // Obstacles
    OBSTACLE_COUNT: 30,            // Number of obstacles to spawn per match

    // Pairing/Attachment
    PAIR_REQUEST_TIMEOUT: 30000,   // Request expires after 30s (ms)
    PAIR_BROADCAST_RANGE: 50,      // Broadcast range for nearby players
    // Attachment offsets
    ATTACH_BACK_DISTANCE: 0.4,     // How far behind the target the attached player is placed

    // Game Duration
    GAME_DURATION: 180000,         // 3 minute (ms)
    GAME_AUTO_START_DELAY: 10000,   // Auto-start after 10s with 2+ players (ms)
    GAME_AUTO_START_MIN_PLAYERS: 2, // Minimum players to auto-start

    // Reconnection
    RECONNECT_TIMEOUT: 30000,      // Keep player state for 30s after disconnect (ms)
    RECONNECT_GRACE_PERIOD: 60000, // Allow reconnection within 60s (ms)
};

// ==================== EXPORTS ====================

const logger = new Logger('MultiLobbyBlinkRoyale');

module.exports = {
    CONFIG,
    logger,
};
