/**
 * client/network.js
 * 
 * Handles all client-side networking with the server using Socket.IO.
 * 
 * Responsibilities:
 * - Connect to server
 * - Send player input (position, rotation, actions)
 * - Receive server updates (player states, monster updates, etc.)
 * - Handle reconnection and error cases
 * - Rate limiting for frequent messages
 * 
 * Communication Flow:
 * 1. Client connects via WebSocket
 * 2. Client sends JOIN_LOBBY with player name
 * 3. Server sends back lobby state and player ID
 * 4. Client continuously sends PLAYER_POSITION updates
 * 5. Server broadcasts LOBBY_STATE with all game entities
 * 6. Client renders received state
 */

import { MESSAGE_TYPES } from '../shared/constants.js';

export class NetworkManager {
  constructor(serverUrl = 'http://localhost:3000') {
    this.serverUrl = serverUrl;
    this.socket = null;
    this.playerId = null;
    this.lobbyId = null;
    this.isConnected = false;
    this.messageQueue = [];
    this.lastMessageTime = {};
  }

  /**
   * Connect to server and set up event handlers
   */
  async connect(playerName = 'Player') {
    return new Promise((resolve, reject) => {
      // Dynamically import Socket.IO client
      const script = document.createElement('script');
      script.src = 'https://cdn.socket.io/4.5.4/socket.io.min.js';
      script.onload = () => {
        this.socket = io(this.serverUrl);

        // Connection events
        this.socket.on('connect', () => {
          console.log('Connected to server');
          this.isConnected = true;

          // Send join lobby request
          this.socket.emit(MESSAGE_TYPES.JOIN_LOBBY, {
            playerName: playerName,
          });
        });

        this.socket.on('disconnect', () => {
          console.log('Disconnected from server');
          this.isConnected = false;
        });

        // Error handling
        this.socket.on('ERROR', (data) => {
          console.error('Server error:', data);
          reject(new Error(data.message));
        });

        // Receive initial lobby state
        this.socket.on(MESSAGE_TYPES.LOBBY_STATE, (data) => {
          this.playerId = data.playerId;
          this.lobbyId = data.lobbyId;
          console.log('Joined lobby', {
            playerId: this.playerId,
            lobbyId: this.lobbyId,
          });
          resolve(data);
        });

        this.socket.on('PLAYER_JOINED', (data) => {
          console.log('Player joined:', data.playerName);
        });

        this.socket.on('PLAYER_LEFT', (data) => {
          console.log('Player left:', data.playerId);
        });
      };
      script.onerror = () => reject(new Error('Failed to load Socket.IO'));
      document.head.appendChild(script);
    });
  }

  /**
   * Send player position and rotation update
   * Rate-limited to prevent flooding server
   */
  sendPlayerUpdate(position, rotation, gaze) {
    if (!this.isConnected) return;

    // Rate limit: max 30 updates per second
    const now = Date.now();
    const lastSend = this.lastMessageTime['position'] || 0;
    if (now - lastSend < 1000 / 30) return;

    this.socket.emit(MESSAGE_TYPES.PLAYER_POSITION, {
      position,
      rotation,
      gaze,
    });

    this.lastMessageTime['position'] = now;
  }

  /**
   * Send blink action
   */
  sendBlink() {
    if (!this.isConnected) return;
    this.socket.emit(MESSAGE_TYPES.BLINK_ACTION, {});
  }

  /**
   * Send orb collection
   */
  sendCollectOrb(orbId) {
    if (!this.isConnected) return;
    this.socket.emit(MESSAGE_TYPES.COLLECT_ORB, { orbId });
  }

  /**
   * Request attachment with another player
   */
  sendAttachRequest(targetPlayerId) {
    if (!this.isConnected) return;
    this.socket.emit(MESSAGE_TYPES.ATTACH_REQUEST, {
      targetPlayerId,
    });
  }

  /**
   * Accept attachment request
   */
  sendAttachResponse(fromPlayerId, accepted) {
    if (!this.isConnected) return;
    this.socket.emit(MESSAGE_TYPES.ATTACH_RESPONSE, {
      from: fromPlayerId,
      accepted,
    });
  }

  /**
   * Detach from attached player
   */
  sendDetach() {
    if (!this.isConnected) return;
    this.socket.emit(MESSAGE_TYPES.DETACH, {});
  }

  /**
   * Broadcast blink timer to nearby players
   */
  sendBlinkTimerBroadcast() {
    if (!this.isConnected) return;
    this.socket.emit(MESSAGE_TYPES.BLINK_TIMER_BROADCAST, {});
  }

  /**
   * Register event listener for receiving updates
   */
  on(eventType, callback) {
    if (this.socket) {
      this.socket.on(eventType, callback);
    }
  }

  /**
   * Remove event listener
   */
  off(eventType, callback) {
    if (this.socket) {
      this.socket.off(eventType, callback);
    }
  }

  /**
   * Check if connected to server
   */
  isReady() {
    return this.isConnected && this.playerId !== null;
  }
}
