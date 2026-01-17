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
    };

    this.minimapCtx = this.elements.minimap.getContext('2d');
    this.minimapWidth = this.elements.minimap.width;
    this.minimapHeight = this.elements.minimap.height;
  }

  /**
   * Hide loading screen
   */
  hideLoading() {
    this.elements.loadingScreen.classList.remove('show');
  }

  /**
   * Update HUD with player stats
   */
  updateHUD(player, gameState) {
    if (!player) return;

    const health = `${player.health.toFixed(0)}/${player.maxHealth}`;
    this.elements.hudHealth.textContent = health;
    this.elements.hudHealth.style.color = player.health < 30 ? '#ff0000' : '#ffff00';

    this.elements.hudScore.textContent = player.score || 0;
    this.elements.hudOrbs.textContent = player.orbsCollected || 0;

    const playerCount = gameState?.players?.length || 0;
    console.log('[UI] Updating player count display:', playerCount, 'gameState.players:', gameState?.players);
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
   * Update blink timer display (both center panel and sidebar)
   */
  updateBlinkTimer(secondsRemaining) {
    if (secondsRemaining > 0) {
      this.elements.blinkTimerPanel.style.display = 'flex';
      this.elements.blinkTimerValue.textContent = secondsRemaining.toFixed(1);

      const percent = secondsRemaining / 20;
      let color;
      if (percent > 0.6) {
        color = '#00ff00';
      } else if (percent > 0.3) {
        color = '#ffff00';
      } else {
        color = '#ff0000';
      }
      this.elements.blinkTimerValue.style.color = color;
    } else {
      this.elements.blinkTimerPanel.style.display = 'none';
    }

    // Update sidebar with 0.1s precision
    this.elements.blinkTimerSidebarValue.textContent = secondsRemaining.toFixed(1) + 's';

    // Color code the sidebar
    const percent = secondsRemaining / 20;
    let sidebarColor;
    if (percent > 0.6) {
      sidebarColor = '#00ff00';
    } else if (percent > 0.3) {
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

    // Monsters
    if (gameState.monsters) {
      for (const m of gameState.monsters) {
        ctx.fillStyle = m.state === 'roaring' ? '#ff0000' : '#ff6600';
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
