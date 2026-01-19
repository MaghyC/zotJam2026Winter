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
    this.serverUrl = serverUrl; // 可以为 null
    this.socket = null;
    this.playerId = null;
    this.lobbyCode = null;
    this.isConnected = false;
    this.isReady = false;
    this.previousPlayerId = null;

    this.lastMessageTime = {};
    this.messageRateLimits = {
      player_input: 1000 / 60,
      broadcast_timer: 2000,
    };

    this.callbacks = {};
  }

  /**
   * Connect to server via Socket.IO
   * @param {string} username - Player username
   * @param {string} previousPlayerId - Optional: player ID from previous session for reconnection
   */
  connect(username = 'Player', previousPlayerId = null) {
    return new Promise((resolve, reject) => {
      try {
        console.log('[Network] Connecting to server:', this.serverUrl);

        // if no serverUrl，use same-origin (works for Render and local)
        const ioOptions = {
          transports: ['websocket', 'polling'],
          reconnection: true,
          reconnectionDelay: 1000,
          reconnectionDelayMax: 5000,
          reconnectionAttempts: 5,
        };

        this.socket = this.serverUrl
          ? io(this.serverUrl, ioOptions)
          : io(ioOptions);

        // Store previous ID for reconnection attempt
        if (previousPlayerId) {
          this.previousPlayerId = previousPlayerId;
        }

        // Connection events
        this.socket.on('connect', () => {
          console.log('[Network] Connected to server (socket:', this.socket.id, ')');
          this.isConnected = true;

          // Request to join lobby
          const joinData = { username };

          // If reconnecting, send the previous player ID
          if (this.previousPlayerId) {
            joinData.previousPlayerId = this.previousPlayerId;
            console.log('[Network] Attempting to reconnect as player:', this.previousPlayerId);
          }

          this.socket.emit('join_lobby', joinData);
        });

        this.socket.on('disconnect', () => {
          console.log('[Network] Disconnected from server');
          this.isConnected = false;
          this.isReady = false;
          this._fireCallback('disconnected');

          if (this.playerId) {
            this.previousPlayerId = this.playerId;
            console.log('[Network] Stored player ID for potential reconnection:', this.previousPlayerId);
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

        // Control request / response
        this.socket.on('control_request', (data) => {
          this._fireCallback('control_request', data);
        });

        this.socket.on('control_response', (data) => {
          this._fireCallback('control_response', data);
        });

        this.socket.on('control_granted', (data) => {
          this._fireCallback('control_granted', data);
        });

        // Attach signals
        this.socket.on('attach_signal', (data) => {
          this._fireCallback('attach_signal', data);
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
   * Decline an attachment request (X key)
   */
  sendAttachDecline(fromPlayerId) {
    if (!this.isReady) return;
    this.socket.emit('attach_response', {
      fromPlayerId,
      accepted: false,
    });
  }

  /**
   * Respond to a control request (accept/decline)
   */
  sendControlResponse(toPlayerId, accepted) {
    if (!this.isReady) return;
    this.socket.emit('control_response', { toPlayerId, accepted });
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
   * Send ready status to server
   */
  sendReady(ready) {
    if (!this.isReady) return;
    this.socket.emit('set_ready', { ready });
    console.log('[Network] Sent ready status:', ready);
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