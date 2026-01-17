/**
 * server/config.js
 * 
 * Centralized server configuration.
 * Move configurable values here for easy tweaking during development and balancing.
 */

export const SERVER_CONFIG = {
  // Server
  PORT: 3000,
  HOST: '0.0.0.0', // listen on all network interfaces for LAN play
  
  // Game settings
  MAX_LOBBIES: 10,
  MAX_PLAYERS_PER_LOBBY: 8,
  
  // Arena
  ARENA_WIDTH: 200,
  ARENA_HEIGHT: 50,
  
  // Physics simulation
  GRAVITY: -9.8,
  GROUND_Y: 0,
  
  // Logging
  DEBUG: true,
};

/**
 * Helper function to log debug messages
 */
export function debugLog(message, data = null) {
  if (SERVER_CONFIG.DEBUG) {
    const timestamp = new Date().toISOString();
    if (data) {
      console.log(`[${timestamp}] ${message}`, data);
    } else {
      console.log(`[${timestamp}] ${message}`);
    }
  }
}

/**
 * Helper to get current server time in milliseconds
 */
export function getServerTime() {
  return Date.now();
}
