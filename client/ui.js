/**
 * client/ui.js
 * 
 * Manages HUD (Heads-Up Display) and minimap rendering.
 * 
 * HUD displays:
 * - Health bar
 * - Current score
 * - Blink timer (with 0.1s precision)
 * - Attachment status
 * - Area broadcasts (nearby blink timers)
 * 
 * Minimap displays:
 * - Local arena layout
 * - Nearby players
 * - Monsters (if visible)
 * - Orbs
 * - Safe zone boundary (shrinking arena)
 */

import { MINIMAP_RANGE, MINIMAP_WIDTH, MINIMAP_HEIGHT } from '../shared/constants.js';

export class UI {
  constructor() {
    this.hudElements = {
      health: document.getElementById('health'),
      score: document.getElementById('score'),
      blinkTimer: document.getElementById('blinkTimer'),
      attachStatus: document.getElementById('attachStatus'),
    };

    this.minimapCanvas = document.getElementById('minimap');
    this.minimapCtx = this.minimapCanvas.getContext('2d');
    this.messagesContainer = document.getElementById('messages');

    // HUD state
    this.currentHealth = 100;
    this.currentScore = 0;
    this.blinkTimerRemaining = 0;
    this.attachmentStatus = 'Alone';

    // Messages queue
    this.messages = []; // array of { text, createdAt }
  }

  /**
   * Update health display
   */
  updateHealth(current, max) {
    this.currentHealth = current;
    this.hudElements.health.textContent = `HP: ${current}/${max}`;

    // Change color based on health
    if (current > max * 0.5) {
      this.hudElements.health.style.color = '#00ff00'; // green
    } else if (current > max * 0.25) {
      this.hudElements.health.style.color = '#ffff00'; // yellow
    } else {
      this.hudElements.health.style.color = '#ff0000'; // red
    }
  }

  /**
   * Update score display
   */
  updateScore(score) {
    this.currentScore = score;
    this.hudElements.score.textContent = `Score: ${score}`;
  }

  /**
   * Update blink timer display
   * Precision: 0.1 seconds
   */
  updateBlinkTimer(remainingSeconds) {
    this.blinkTimerRemaining = Math.max(0, remainingSeconds);

    if (this.blinkTimerRemaining <= 0) {
      this.hudElements.blinkTimer.textContent = 'Blink: Ready';
      this.hudElements.blinkTimer.style.color = '#00ff00';
    } else {
      // Format to 0.1s precision
      const formatted = this.blinkTimerRemaining.toFixed(1);
      this.hudElements.blinkTimer.textContent = `Blink: ${formatted}s`;
      this.hudElements.blinkTimer.style.color = '#ffff00';
    }
  }

  /**
   * Update attachment status
   */
  updateAttachmentStatus(status) {
    this.attachmentStatus = status;
    this.hudElements.attachStatus.textContent = `Status: ${status}`;
  }

  /**
   * Draw minimap based on current game state
   */
  drawMinimap(playerPosition, playerRotation, gameState) {
    const ctx = this.minimapCtx;
    const width = MINIMAP_WIDTH;
    const height = MINIMAP_HEIGHT;
    const scale = width / (MINIMAP_RANGE * 2);

    // Clear minimap
    ctx.fillStyle = '#001a00';
    ctx.fillRect(0, 0, width, height);

    // Draw border
    ctx.strokeStyle = '#00ff00';
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, width, height);

    // Center point (where player is)
    const centerX = width / 2;
    const centerY = height / 2;

    // Draw visited areas (simplified: just the immediate area)
    ctx.fillStyle = 'rgba(0, 100, 0, 0.3)';
    ctx.fillRect(0, 0, width, height);

    // Draw safe zone circle (arena boundary)
    ctx.strokeStyle = 'rgba(0, 255, 0, 0.5)';
    ctx.lineWidth = 2;
    const safeRadius = 100; // TODO: get from gameState
    ctx.beginPath();
    ctx.arc(centerX, centerY, safeRadius * scale, 0, Math.PI * 2);
    ctx.stroke();

    // Draw shrinking zone indicator
    if (gameState && gameState.arenaSafeRadius) {
      ctx.strokeStyle = 'rgba(255, 0, 0, 0.5)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(centerX, centerY, gameState.arenaSafeRadius * scale, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Draw other players
    if (gameState && gameState.players) {
      for (const player of gameState.players) {
        if (player.id === playerPosition.id) continue; // Skip self

        const relX = player.position.x - playerPosition.x;
        const relZ = player.position.z - playerPosition.z;
        const mapX = centerX + relX * scale;
        const mapY = centerY + relZ * scale;

        ctx.fillStyle = '#0099ff';
        ctx.beginPath();
        ctx.arc(mapX, mapY, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Draw monsters
    if (gameState && gameState.monsters) {
      for (const monster of gameState.monsters) {
        const relX = monster.position.x - playerPosition.x;
        const relZ = monster.position.z - playerPosition.z;
        const mapX = centerX + relX * scale;
        const mapY = centerY + relZ * scale;

        // Only show on minimap for first 10 seconds after spawn
        const timeSinceSpawn = (Date.now() - monster.spawnTime) / 1000;
        if (timeSinceSpawn < 10) {
          ctx.fillStyle = '#ff0000';
          ctx.beginPath();
          ctx.arc(mapX, mapY, 4, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // Draw orbs
    if (gameState && gameState.orbs) {
      for (const orb of gameState.orbs) {
        if (orb.collected) continue;

        const relX = orb.position.x - playerPosition.x;
        const relZ = orb.position.z - playerPosition.z;
        const mapX = centerX + relX * scale;
        const mapY = centerY + relZ * scale;

        ctx.fillStyle = '#ffff00';
        ctx.beginPath();
        ctx.arc(mapX, mapY, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Draw player indicator (center, pointing forward)
    const arrowLength = 8;
    ctx.fillStyle = '#00ff00';
    ctx.beginPath();
    ctx.arc(centerX, centerY, 4, 0, Math.PI * 2);
    ctx.fill();

    // Draw facing direction arrow
    const cosY = Math.cos(playerRotation.y);
    const sinY = Math.sin(playerRotation.y);
    ctx.strokeStyle = '#00ff00';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.lineTo(
      centerX + sinY * arrowLength,
      centerY + cosY * arrowLength
    );
    ctx.stroke();
  }

  /**
   * Add a broadcast message to display (blink timer, monster signal, etc.)
   */
  addBroadcast(text) {
    const messageEl = document.createElement('div');
    messageEl.className = 'message';
    messageEl.textContent = text;
    this.messagesContainer.appendChild(messageEl);

    // Remove after animation
    setTimeout(() => {
      messageEl.remove();
    }, 3000);
  }

  /**
   * Show a status message briefly
   */
  showMessage(text, duration = 3) {
    const messageEl = document.createElement('div');
    messageEl.className = 'message';
    messageEl.textContent = text;
    this.messagesContainer.appendChild(messageEl);

    setTimeout(() => {
      messageEl.remove();
    }, duration * 1000);
  }

  /**
   * Show loading screen
   */
  showLoading(text = 'Loading...') {
    const loadingScreen = document.getElementById('loadingScreen');
    document.getElementById('loadingText').textContent = text;
    loadingScreen.style.display = 'flex';
  }

  /**
   * Hide loading screen
   */
  hideLoading() {
    const loadingScreen = document.getElementById('loadingScreen');
    loadingScreen.style.display = 'none';
  }

  /**
   * Update entire HUD at once (useful for efficiency)
   */
  updateHUD(playerState) {
    if (playerState.health !== undefined) {
      this.updateHealth(playerState.health, playerState.maxHealth || 100);
    }
    if (playerState.score !== undefined) {
      this.updateScore(playerState.score);
    }
    if (playerState.blinkTimerRemaining !== undefined) {
      this.updateBlinkTimer(playerState.blinkTimerRemaining);
    }
    if (playerState.attachmentStatus !== undefined) {
      this.updateAttachmentStatus(playerState.attachmentStatus);
    }
  }
}
