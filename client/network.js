/**
 * client/network.js
 * 
 * Client-side networking with Socket.IO for real-time multiplayer.
 * Handles all server communication with rate limiting and error recovery.
 * 
 * Production-ready: proper reconnection, event handling, and logging.
 */

class NetworkManager {
  constructor(serverUrl = null) {
    // Auto-detect server URL
    if (!serverUrl) {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.hostname || 'localhost';
      const port = window.location.port || '3000';
      serverUrl = `${protocol}//${host}:${port}`;
    }

    this.serverUrl = serverUrl;
    this.socket = null;
    this.playerId = null;
    this.lobbyCode = null;
    this.isConnected = false;
    this.isReady = false;
    this.previousPlayerId = null; // Track player ID for reconnection

    // Rate limiting
    this.lastMessageTime = {};
    this.messageRateLimits = {
      player_input: 1000 / 60, // 60 Hz
      broadcast_timer: 2000, // Every 2s
    };

    // Callbacks
    this.callbacks = {};
  }

  /**
   * Connect to server via Socket.IO
   */
  connect(username = 'Player') {
    return new Promise((resolve, reject) => {
      try {
        console.log('[Network] Connecting to server:', this.serverUrl);

        this.socket = io(this.serverUrl, {
          transports: ['websocket', 'polling'],
          reconnection: true,
          reconnectionDelay: 1000,
          reconnectionDelayMax: 5000,
          reconnectionAttempts: 5,
        });

        // Connection events
        this.socket.on('connect', () => {
          console.log('[Network] Connected to server (socket:', this.socket.id, ')');
          this.isConnected = true;

          // Request to join lobby
          this.socket.emit('join_lobby', {
            username: username,
          });
        });

        this.socket.on('disconnect', () => {
          console.log('[Network] Disconnected from server');
          this.isConnected = false;
          this.isReady = false;
          this._fireCallback('disconnected');

          // If we had a playerId, attempt to reconnect
          if (this.playerId) {
            this.previousPlayerId = this.playerId;
            this.playerId = null; // Clear current ID to allow reconnection
            console.log('[Network] Attempting automatic reconnection for player:', this.previousPlayerId);
            this._attemptReconnection();
          }
        });

        this.socket.on('error', (error) => {
          console.error('[Network] Socket error:', error);
          this._fireCallback('error', error);
        });

        // Server response to join lobby
        this.socket.on('join_lobby_response', (data) => {
          if (data.success) {
            this.playerId = data.playerId;
            this.lobbyCode = data.lobbyCode;
            this.isReady = true;
            console.log('[Network] Joined lobby:', this.lobbyCode, 'as player:', this.playerId);
            this._fireCallback('joined_lobby', data);
            resolve(data);
          } else {
            const err = new Error(data.message || 'Failed to join lobby');
            console.error('[Network]', err.message);
            reject(err);
          }
        });

        // State updates from server
        this.socket.on('state_update', (data) => {
          this._fireCallback('state_update', data);
        });

        // Match lifecycle
        this.socket.on('match_start', (data) => {
          console.log('[Network] Match started');
          this._fireCallback('match_start', data);
        });

        this.socket.on('match_end', (data) => {
          console.log('[Network] Match ended:', data.winners);
          this._fireCallback('match_end', data);
        });

        // Player events
        this.socket.on('player_joined', (data) => {
          console.log('[Network] Player joined:', data.username);
          this._fireCallback('player_joined', data);
        });

        this.socket.on('player_left', (data) => {
          console.log('[Network] Player left:', data.playerId);
          this._fireCallback('player_left', data);
        });

        // Game events
        this.socket.on('orb_collected', (data) => {
          this._fireCallback('orb_collected', data);
        });

        this.socket.on('blink_response', (data) => {
          this._fireCallback('blink_response', data);
        });

        // Pairing/Attachment events
        this.socket.on('attach_request', (data) => {
          this._fireCallback('attach_request', data);
        });

        this.socket.on('attach_accepted', (data) => {
          this._fireCallback('attach_accepted', data);
        });

        this.socket.on('attach_declined', (data) => {
          this._fireCallback('attach_declined', data);
        });

        this.socket.on('player_detached', (data) => {
          this._fireCallback('player_detached', data);
        });

        this.socket.on('timer_broadcast', (data) => {
          this._fireCallback('timer_broadcast', data);
        });

        // Reconnection events
        this.socket.on('reconnect_success', (data) => {
          console.log('[Network] Successfully reconnected to lobby:', data.lobbyId);
          this.playerId = data.playerData.id || this.previousPlayerId;
          this.lobbyCode = data.lobbyId;
          this.isReady = true;
          this._fireCallback('reconnect_success', data);
        });

        this.socket.on('reconnect_failed', (data) => {
          console.warn('[Network] Reconnection failed:', data.reason);
          this.previousPlayerId = null;
          this._fireCallback('reconnect_failed', data);
        });

        this.socket.on('player_disconnected', (data) => {
          console.log('[Network] Player disconnected:', data.playerId);
          this._fireCallback('player_disconnected', data);
        });

        this.socket.on('player_reconnected', (data) => {
          console.log('[Network] Player reconnected:', data.playerId);
          this._fireCallback('player_reconnected', data);
        });        // Error messages
        this.socket.on('error', (data) => {
          console.error('[Network] Server error:', data.message);
          this._fireCallback('server_error', data);
        });

      } catch (error) {
        console.error('[Network] Connection failed:', error);
        reject(error);
      }
    });
  }

  /**
   * Send player input (position, rotation, gaze) - rate limited
   */
  sendPlayerInput(position, rotation, gaze) {
    if (!this.isReady) return;

    const now = Date.now();
    const lastSend = this.lastMessageTime['player_input'] || 0;
    const limit = this.messageRateLimits['player_input'];

    if (now - lastSend < limit) return;

    this.socket.emit('player_input', {
      position,
      rotation,
      gaze,
    });

    this.lastMessageTime['player_input'] = now;
  }

  /**
   * Send blink action (player presses R key)
   */
  sendBlink() {
    if (!this.isReady) return;
    this.socket.emit('blink_action', {});
  }

  /**
   * Send orb collection (player collects orb with left-click)
   */
  sendCollectOrb(orbId) {
    if (!this.isReady) return;
    this.socket.emit('collect_orb', { orbId });
  }

  /**
   * Request attachment with another player (point + V)
   */
  sendAttachRequest(targetPlayerId) {
    if (!this.isReady) return;
    this.socket.emit('attach_request', { targetPlayerId });
  }

  /**
   * Accept or decline attachment request (V or X)
   */
  sendAttachResponse(fromPlayerId, accepted) {
    if (!this.isReady) return;
    this.socket.emit('attach_response', {
      fromPlayerId,
      accepted,
    });
  }

  /**
   * Detach from attached player (U twice in 0.5s)
   */
  sendDetach() {
    if (!this.isReady) return;
    this.socket.emit('detach', {});
  }

  /**
   * Broadcast blink timer to nearby pairs (I key) - rate limited
   */
  sendBroadcastTimer() {
    if (!this.isReady) return;

    const now = Date.now();
    const lastSend = this.lastMessageTime['broadcast_timer'] || 0;
    const limit = this.messageRateLimits['broadcast_timer'];

    if (now - lastSend < limit) return;

    this.socket.emit('broadcast_timer', {});
    this.lastMessageTime['broadcast_timer'] = now;
  }

  /**
   * Register callback for network events
   */
  on(eventName, callback) {
    if (!this.callbacks[eventName]) {
      this.callbacks[eventName] = [];
    }
    this.callbacks[eventName].push(callback);
  }

  /**
   * Unregister callback
   */
  off(eventName, callback) {
    if (this.callbacks[eventName]) {
      this.callbacks[eventName] = this.callbacks[eventName].filter(cb => cb !== callback);
    }
  }

  /**
   * Fire all callbacks for an event
   */
  _fireCallback(eventName, data = null) {
    if (this.callbacks[eventName]) {
      for (const callback of this.callbacks[eventName]) {
        try {
          callback(data);
        } catch (error) {
          console.error('[Network] Callback error:', error);
        }
      }
    }
  }

  /**
   * Check if ready to send/receive
   */
  isReady() {
    return this.isConnected && this.isReady && this.playerId !== null;
  }

  /**
   * Disconnect from server
   */
  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.isConnected = false;
      this.isReady = false;
    }
  }

  /**
   * Attempt to reconnect with previous player ID
   * Called when socket reconnects after temporary disconnect
   */
  _attemptReconnection() {
    if (!this.socket || !this.previousPlayerId) {
      console.warn('[Network] Cannot attempt reconnection - missing socket or previousPlayerId');
      return;
    }

    // Check if socket has reconnected
    if (this.socket.connected) {
      console.log('[Network] Sending reconnection request for player:', this.previousPlayerId);
      this.socket.emit('reconnect', { playerId: this.previousPlayerId });
    } else {
      // Socket still disconnected, retry after delay
      setTimeout(() => this._attemptReconnection(), 1000);
    }
  }

}
window.NetworkManager = NetworkManager;