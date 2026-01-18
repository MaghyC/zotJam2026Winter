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

    // Normalize missing elements to null and guard canvas context
    for (const k of Object.keys(this.elements)) {
      if (!this.elements[k]) this.elements[k] = null;
    }

    if (this.elements.minimap) {
      this.minimapCtx = this.elements.minimap.getContext('2d');
      this.minimapWidth = this.elements.minimap.width;
      this.minimapHeight = this.elements.minimap.height;
    } else {
      this.minimapCtx = null;
      this.minimapWidth = 200;
      this.minimapHeight = 200;
    }

    this.isPlayerReady = false;
    // Wire attach accept/decline buttons
    if (this.elements.attachAcceptBtn) {
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
    }
    if (this.elements.attachDeclineBtn) {
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
    }

    // Wire control accept/decline
    if (this.elements.controlAcceptBtn) {
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
    }
    if (this.elements.controlDeclineBtn) {
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
    if (this.elements.hudHealth) {
      this.elements.hudHealth.textContent = '100/100';
      this.elements.hudHealth.style.color = '#ffff00';
    }
    if (this.elements.hudScore) this.elements.hudScore.textContent = '0';
    if (this.elements.hudPlayers) this.elements.hudPlayers.textContent = '0/8';
    if (this.elements.hudMonsters) this.elements.hudMonsters.textContent = '0';
    if (this.elements.hudStatus) this.elements.hudStatus.textContent = 'Alone';

    // Reset blink timer
    this.updateBlinkTimer(0);

    // Clear any messages (use `messages` element)
    if (this.elements.messages) {
      this.elements.messages.textContent = '';
    }
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
    // If no player, fallback to center map at arena center
    const viewRadius = 50; // show +/- 50 units around player
    const centerX = this.minimapWidth / 2;
    const centerY = this.minimapHeight / 2;
    const scale = (this.minimapWidth / 2) / viewRadius;

    ctx.fillStyle = 'rgba(0, 20, 50, 0.9)';
    ctx.fillRect(0, 0, this.minimapWidth, this.minimapHeight);

    if (!gameState) return;

    // If we have a local player, center the map on them and rotate so their forward is up
    const local = player;
    const yaw = (local && local.rotation && typeof local.rotation.y === 'number') ? local.rotation.y : 0;

    // Draw other entities relative to player and rotated by -yaw
    function worldToMap(dx, dz) {
      // rotate by -yaw
      const cos = Math.cos(yaw);
      const sin = Math.sin(yaw);
      const rx = dx * cos + dz * sin; // dx*cos + dz*sin
      const rz = -dx * sin + dz * cos; // -dx*sin + dz*cos
      return { x: centerX + rx * scale, y: centerY - rz * scale };
    }

    // Draw obstacles (server-provided if present)
    ctx.fillStyle = '#888888';
    const obstacles = gameState.obstacles || [];
    for (const obs of obstacles) {
      const dx = obs.position.x - (local ? local.position.x : 0);
      const dz = obs.position.z - (local ? local.position.z : 0);
      const m = worldToMap(dx, dz);
      const w = (obs.width || 6) * scale;
      const h = (obs.depth || 6) * scale;
      ctx.fillRect(m.x - w / 2, m.y - h / 2, w, h);
    }

    // Draw other players
    if (gameState.players) {
      for (const p of gameState.players) {
        if (p.id === local?.id) continue;
        const dx = p.position.x - (local ? local.position.x : 0);
        const dz = p.position.z - (local ? local.position.z : 0);
        const m = worldToMap(dx, dz);
        ctx.fillStyle = p.attachedTo === local?.id ? '#0088ff' : '#00ff00';
        ctx.fillRect(m.x - 3, m.y - 3, 6, 6);
      }
    }

    // Draw monsters
    if (gameState.monsters) {
      const now = Date.now();
      for (const m of gameState.monsters) {
        const dx = m.position.x - (local ? local.position.x : 0);
        const dz = m.position.z - (local ? local.position.z : 0);
        const mm = worldToMap(dx, dz);
        const isFreshSpawn = m.spawnTime && (now - m.spawnTime < 10000);
        ctx.fillStyle = isFreshSpawn ? '#ff0000' : '#ff6600';
        ctx.beginPath();
        ctx.arc(mm.x, mm.y, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Orbs intentionally not shown on minimap — obstacles are shown instead

    // Draw local player at center
    if (local) {
      ctx.fillStyle = '#ffff00';
      ctx.fillRect(centerX - 4, centerY - 4, 8, 8);

      // Draw heading based on rotation.y (yaw). Forward = up.
      const len = 12;
      const hx = Math.sin(yaw) * len;
      const hy = Math.cos(yaw) * len;
      ctx.strokeStyle = '#ffff00';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.lineTo(centerX + hx, centerY - hy);
      ctx.stroke();
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
