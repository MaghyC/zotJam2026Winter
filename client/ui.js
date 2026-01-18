/**
 * client/ui.js
 * 
 * UI rendering and management for HUD, minimap, messages, and screens.
 */

class UIManager {
  constructor() {
    this.elements = {
      loadingScreen: document.getElementById('loadingScreen'),
      hudHealth: document.getElementById('hudHealth'),
      hudScore: document.getElementById('hudScore'),
      hudOrbs: document.getElementById('hudOrbs'),
      hudPlayers: document.getElementById('hudPlayers'),
      hudMonsters: document.getElementById('hudMonsters'),
      hudStatus: document.getElementById('hudStatus'),
      blinkTimerPanel: document.getElementById('blinkTimerPanel'),
      blinkTimerValue: document.getElementById('blinkTimerValue'),
      blinkTimerSidebarValue: document.getElementById('blinkTimerSidebarValue'),
      minimap: document.getElementById('minimap'),
      messages: document.getElementById('messages'),
      matchEndScreen: document.getElementById('matchEndScreen'),
      readyPanel: document.getElementById('readyPanel'),
      readyBtn: document.getElementById('readyBtn'),
      readyCount: document.getElementById('readyCount'),
      attachNotification: document.getElementById('attachNotification'),
      attachNotificationText: document.getElementById('attachNotificationText'),
      attachAcceptBtn: document.getElementById('attachAcceptBtn'),
      attachDeclineBtn: document.getElementById('attachDeclineBtn'),
      controlNotification: document.getElementById('controlNotification'),
      controlNotificationText: document.getElementById('controlNotificationText'),
      controlAcceptBtn: document.getElementById('controlAcceptBtn'),
      controlDeclineBtn: document.getElementById('controlDeclineBtn'),
    };

    this.minimapCtx = this.elements.minimap.getContext('2d');
    this.minimapWidth = this.elements.minimap.width;
    this.minimapHeight = this.elements.minimap.height;

    this.isPlayerReady = false;
    // Wire attach accept/decline buttons
    this.elements.attachAcceptBtn.addEventListener('click', () => {
      if (this.attachRequestData) {
        const fromId = this.attachRequestData.fromPlayerId || this.attachRequestData.from;
        if (window.gameClient && window.gameClient.network && typeof window.gameClient.network.sendAttachResponse === 'function') {
          window.gameClient.network.sendAttachResponse(fromId, true);
        } else {
          window.gameClient.network.socket.emit('attach_response', { fromPlayerId: fromId, accepted: true });
        }
        this.hideAttachRequest();
      }
    });
    this.elements.attachDeclineBtn.addEventListener('click', () => {
      if (this.attachRequestData) {
        const fromId = this.attachRequestData.fromPlayerId || this.attachRequestData.from;
        if (window.gameClient && window.gameClient.network && typeof window.gameClient.network.sendAttachResponse === 'function') {
          window.gameClient.network.sendAttachResponse(fromId, false);
        } else {
          window.gameClient.network.socket.emit('attach_response', { fromPlayerId: fromId, accepted: false });
        }
        this.hideAttachRequest();
      }
    });

    // Wire control accept/decline
    this.elements.controlAcceptBtn.addEventListener('click', () => {
      if (this.controlRequestData) {
        const fromId = this.controlRequestData.fromPlayerId || this.controlRequestData.from;
        if (window.gameClient && window.gameClient.network && typeof window.gameClient.network.sendControlResponse === 'function') {
          window.gameClient.network.sendControlResponse(fromId, true);
        } else {
          window.gameClient.network.socket.emit('control_response', { toPlayerId: fromId, accepted: true });
        }
        this.elements.controlNotification.classList.remove('show');
      }
    });
    this.elements.controlDeclineBtn.addEventListener('click', () => {
      if (this.controlRequestData) {
        const fromId = this.controlRequestData.fromPlayerId || this.controlRequestData.from;
        if (window.gameClient && window.gameClient.network && typeof window.gameClient.network.sendControlResponse === 'function') {
          window.gameClient.network.sendControlResponse(fromId, false);
        } else {
          window.gameClient.network.socket.emit('control_response', { toPlayerId: fromId, accepted: false });
        }
        this.elements.controlNotification.classList.remove('show');
      }
    });
  }

  /**
   * Hide loading screen
   */
  hideLoading() {
    this.elements.loadingScreen.classList.remove('show');
  }

  /**
   * Show ready panel (in lobby waiting for match start)
   */
  showReadyPanel() {
    this.elements.readyPanel.classList.add('show');
  }

  /**
   * Hide ready panel (match has started)
   */
  hideReadyPanel() {
    this.elements.readyPanel.classList.remove('show');
  }

  /**
   * Update ready panel with player count and states
   */
  updateReadyPanel(players, localPlayerId) {
    if (!players || players.length === 0) return;

    const readyCount = players.filter(p => p.ready).length;
    this.elements.readyCount.textContent = `${readyCount}/${players.length} Ready`;

    const allReady = readyCount === players.length && players.length > 1;
    if (allReady) {
      this.elements.readyPanel.classList.add('active');
    } else {
      this.elements.readyPanel.classList.remove('active');
    }

    const localPlayer = players.find(p => p.id === localPlayerId);
    if (localPlayer?.ready) {
      this.elements.readyBtn.classList.add('ready');
      this.elements.readyBtn.textContent = 'READY ✓';
    } else {
      this.elements.readyBtn.classList.remove('ready');
      this.elements.readyBtn.textContent = 'READY';
    }
  }

  /**
   * Show attach request notification
   */
  showAttachRequest(fromPlayerNameOrId, fromPlayerId) {
    let name = null;
    let id = null;
    if (fromPlayerId) {
      name = fromPlayerNameOrId;
      id = fromPlayerId;
    } else {
      id = fromPlayerNameOrId;
      name = null;
    }
    const display = name || (id ? id.slice(0, 6) : 'Unknown');
    this.elements.attachNotificationText.textContent = `${display} wants to attach!`;
    this.elements.attachNotification.classList.add('show');
    this.attachRequestData = { fromPlayerName: name, fromPlayerId: id };
  }

  showControlRequest(fromPlayerId) {
    // Accept either (name, id) or id-only
    let name = null;
    let id = null;
    if (arguments.length === 2) {
      name = arguments[0];
      id = arguments[1];
    } else if (typeof fromPlayerId === 'string') {
      id = fromPlayerId;
    }

    const display = name || (id ? id.slice(0, 6) : 'Unknown');
    this.elements.controlNotificationText.textContent = `${display} requests control (5s)`;
    this.elements.controlNotification.classList.add('show');
    this.controlRequestData = { fromPlayerName: name, fromPlayerId: id };

    // Start countdown for auto-decline (server auto-declines after 5s)
    if (this.controlTimer) clearInterval(this.controlTimer);
    this.controlCountdown = 5.0;
    this.controlTimer = setInterval(() => {
      this.controlCountdown = Math.max(0, this.controlCountdown - 0.25);
      const sec = this.controlCountdown.toFixed(1);
      this.elements.controlNotificationText.textContent = `${display} requests control (${sec}s)`;
      if (this.controlCountdown <= 0) {
        this.hideControlRequest();
      }
    }, 250);
  }

  hideControlRequest() {
    this.elements.controlNotification.classList.remove('show');
    if (this.controlTimer) {
      clearInterval(this.controlTimer);
      this.controlTimer = null;
    }
    this.controlRequestData = null;
    this.controlCountdown = 0;
  }

  /**
   * Hide attach request notification
   */
  hideAttachRequest() {
    this.elements.attachNotification.classList.remove('show');
    this.attachRequestData = null;
  }

  /**
   * Hide loading screen
   */
  updateHUD(player, gameState) {
    if (!player) return;

    const health = `${player.health.toFixed(0)}/${player.maxHealth}`;
    this.elements.hudHealth.textContent = health;
    this.elements.hudHealth.style.color = player.health < 30 ? '#ff0000' : '#ffff00';

    this.elements.hudScore.textContent = player.score || 0;

    const playerCount = gameState?.players?.length || 0;
    //console.log('[UI] Updating player count display:', playerCount, 'gameState.players:', gameState?.players);
    this.elements.hudPlayers.textContent = `${playerCount}/8`;

    const monsterCount = gameState?.monsters?.length || 0;
    this.elements.hudMonsters.textContent = monsterCount;

    let status = 'Alone';
    if (player.attachedTo) {
      status = '💙 Paired';
    }
    this.elements.hudStatus.textContent = status;
  }

  /**
   * Reset game HUD to initial state for new match
   */
  resetGameHUD() {
    this.elements.hudHealth.textContent = '100/100';
    this.elements.hudHealth.style.color = '#ffff00';
    this.elements.hudScore.textContent = '0';
    this.elements.hudPlayers.textContent = '0/8';
    this.elements.hudMonsters.textContent = '0';
    this.elements.hudStatus.textContent = 'Alone';
    // Reset blink timer
    this.updateBlinkTimer(0, 20);
    // Clear any messages
    this.elements.messageBox.textContent = '';
  }

  /**
   * Update blink timer display (both center panel and sidebar)
   */
  updateBlinkTimer(secondsRemaining) {
    const maxSeconds = 20; // UI assumes 20s max blink timer

    // Don't display center circle - only sidebar
    // if (secondsRemaining > 0) {
    //   this.elements.blinkTimerPanel.style.display = 'flex';
    //   this.elements.blinkTimerValue.textContent = secondsRemaining.toFixed(1);
    // } else {
    //   this.elements.blinkTimerPanel.style.display = 'none';
    // }

    // Update sidebar with 0.1s precision
    this.elements.blinkTimerSidebarValue.textContent = secondsRemaining.toFixed(1) + 's';

    // Color code the sidebar
    const sidebarPercent = Math.max(0, Math.min(1, secondsRemaining / maxSeconds));
    let sidebarColor;
    if (sidebarPercent > 0.6) {
      sidebarColor = '#00ff00';
    } else if (sidebarPercent > 0.3) {
      sidebarColor = '#ffff00';
    } else {
      sidebarColor = '#ff0000';
    }
    this.elements.blinkTimerSidebarValue.style.color = sidebarColor;
  }

  /**
   * Draw minimap
   */
  drawMinimap(player, gameState, arenaRadius) {
    const ctx = this.minimapCtx;
    const centerX = this.minimapWidth / 2;
    const centerY = this.minimapHeight / 2;
    const scale = (this.minimapWidth / 2) / 50;

    ctx.fillStyle = 'rgba(0, 20, 50, 0.9)';
    ctx.fillRect(0, 0, this.minimapWidth, this.minimapHeight);

    // Arena boundary
    ctx.strokeStyle = '#0099ff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(centerX, centerY, (arenaRadius / 50) * (this.minimapWidth / 2), 0, Math.PI * 2);
    ctx.stroke();

    if (!gameState) return;

    // Safe zone
    const safeRadius = gameState.arenaSafeRadius || arenaRadius;
    ctx.strokeStyle = '#ff0000';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.arc(centerX, centerY, (safeRadius / 50) * (this.minimapWidth / 2), 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // Player
    if (player) {
      ctx.fillStyle = '#ffff00';
      const playerX = centerX + (player.position.x * scale);
      const playerY = centerY + (player.position.z * scale);
      ctx.fillRect(playerX - 3, playerY - 3, 6, 6);

      ctx.strokeStyle = '#ffff00';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(playerX, playerY);
      ctx.lineTo(playerX + player.gaze.x * 10, playerY + player.gaze.z * 10);
      ctx.stroke();
    }

    // Other players
    if (gameState.players) {
      for (const p of gameState.players) {
        if (p.id === player?.id) continue;
        ctx.fillStyle = p.attachedTo === player?.id ? '#0088ff' : '#00ff00';
        const px = centerX + (p.position.x * scale);
        const py = centerY + (p.position.z * scale);
        ctx.fillRect(px - 2, py - 2, 4, 4);
      }
    }

    // Obstacles (simple static layout)
    const obstacles = [
      { x: 40, z: 40, w: 8, d: 8 },
      { x: -50, z: 30, w: 6, d: 6 },
      { x: 0, z: -60, w: 10, d: 10 },
      { x: -40, z: -40, w: 5, d: 5 },
      { x: 60, z: -20, w: 7, d: 7 },
      { x: -30, z: 0, w: 6, d: 6 }
    ];
    ctx.fillStyle = '#888888';
    for (const obs of obstacles) {
      const px = centerX + (obs.x * scale);
      const py = centerY + (obs.z * scale);
      const w = obs.w * scale;
      const h = obs.d * scale;
      ctx.fillRect(px - w / 2, py - h / 2, w, h);
    }

    // Monsters
    if (gameState.monsters) {
      const now = Date.now();
      for (const m of gameState.monsters) {
        // Red for first 10s after spawn, then orange
        const isFreshSpawn = m.spawnTime && (now - m.spawnTime < 10000);
        ctx.fillStyle = isFreshSpawn ? '#ff0000' : '#ff6600';
        const mx = centerX + (m.position.x * scale);
        const my = centerY + (m.position.z * scale);
        ctx.beginPath();
        ctx.arc(mx, my, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  /**
   * Show a message
   */
  showMessage(text, type = 'normal') {
    const msg = document.createElement('div');
    msg.className = `message ${type}`;
    msg.textContent = text;
    this.elements.messages.appendChild(msg);
    setTimeout(() => msg.remove(), 3000);
  }

  /**
   * Show match end screen
   */
  showMatchEnd(results) {
    this.elements.matchEndScreen.classList.add('show');

    let title = 'GAME OVER';
    let statsHTML = '';

    if (results.winners && results.winners.length > 0) {
      const winner = results.winners[0];
      title = `🏆 ${winner.username} WINS! 🏆`;
      statsHTML = `<div class="winner-name">Score: ${winner.score}</div>`;
    }

    if (results.playerStats) {
      statsHTML += '<div class="stats-table">';
      statsHTML += '<div class="stat-row"><strong>Final Rankings:</strong></div>';

      const sorted = [...results.playerStats].sort((a, b) => b.score - a.score);
      for (let i = 0; i < Math.min(5, sorted.length); i++) {
        const p = sorted[i];
        statsHTML += `<div class="stat-row">#${i + 1}: ${p.username} - ${p.score} pts</div>`;
      }
      statsHTML += '</div>';
    }

    document.getElementById('endTitle').textContent = title;
    document.getElementById('endStats').innerHTML = statsHTML;
  }
}

window.UIManager = UIManager;
