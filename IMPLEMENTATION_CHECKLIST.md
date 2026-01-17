# Multi-Lobby Blink Royale - Implementation Checklist

## Phase-by-Phase Implementation Guide

### ✅ PHASE 1: Core Infrastructure (COMPLETED)
Your skeleton code is complete with all basic structure. Now implement:

- [ ] **Test server starts without errors**
  - Run: `npm install` then `npm start`
  - Expected: Server running on port 3000, no crashes

- [ ] **Test client connects**
  - Open http://localhost:3000 in browser
  - Expected: Loading screen disappears, game canvas appears

- [ ] **Test WASD movement**
  - Open console (F12 → Console)
  - Press WASD - should see position changes logged
  - **File to modify**: `client/playerController.js` - `updateMovement()`

- [ ] **Test mouse look**
  - Move mouse to look around
  - **File to modify**: `client/playerController.js` - `updateRotation()`

- [ ] **Test position sync**
  - Open `/admin/stats` - should show 1 player
  - Open 2 tabs - should show 2 players
  - **File to test**: `server/index.js` - socket handlers

**Estimated time**: 2-3 days

---

### ☐ PHASE 2: Game Mechanics (Collectibles & Blink)
**Goal**: Collect items, track score, manage blink cooldown

#### Subtask 1: Orb Spawning
- [ ] In `server/index.js`, add code to `startGameLoop()` to spawn 15 orbs at random positions
- [ ] Each orb should have a unique ID, position, and value
- [ ] Store orbs in `gameState.orbs` Map
- [ ] When spawning, broadcast ORB_SPAWNED message to all clients

```javascript
// Pseudocode for server
function spawnOrbs(gameState) {
  for (let i = 0; i < 15; i++) {
    const position = getRandomPositionInArena(); // circle radius < 90
    const orbId = `orb_${Date.now()}_${i}`;
    gameState.spawnOrb(orbId, position);
  }
}
```

- [ ] On client, create orb meshes in `scene.js` when ORB_SPAWNED received
- [ ] Render yellow spinning spheres (already have mesh code)

**Estimated time**: 1 day

#### Subtask 2: Orb Collection
- [ ] Detect when player is near orb (distance < 3 units)
- [ ] Raycast from camera to check if looking at orb
- [ ] On left-click or nearby, send COLLECT_ORB message
- [ ] Server validates collection, updates score
- [ ] Client removes orb mesh when ORBASE_COLLECTED received

**File to modify**: `client/playerController.js` - add raycast detection
**Estimated time**: 1.5 days

#### Subtask 3: Blink System
- [ ] Server tracks `player.blinkCooldownEnd` for each player
- [ ] On BLINK_ACTION, check if cooldown expired
- [ ] If yes: reset cooldown to current time + BLINK_COOLDOWN_DURATION
- [ ] If no: reject action (send error to client)
- [ ] Client displays blink timer in HUD with 0.1s precision

```javascript
// Client pseudo-code
function updateBlinkTimer() {
  const elapsed = (serverTime - player.blinkCooldownEnd) * 1000;
  if (elapsed > 0) {
    ui.updateBlinkTimer(0); // "Ready"
  } else {
    ui.updateBlinkTimer(Math.abs(elapsed / 1000)); // remaining seconds
  }
}
```

**Files to modify**: `server/gameState.js`, `server/index.js`, `client/ui.js`
**Estimated time**: 1.5 days

#### Subtask 4: Minimap Rendering
- [ ] Implement basic minimap in `client/ui.js` - `drawMinimap()`
- [ ] Draw player position (center, green circle)
- [ ] Draw arena boundary (green circle)
- [ ] Draw facing direction (arrow from center)
- [ ] Draw nearby players as blue dots
- [ ] Draw orbs as yellow dots
- [ ] Update every frame

**Estimated time**: 1 day

**Testing Milestone**: Can you collect 5 orbs and see score increase? Blink timer counts down?

---

### ☐ PHASE 3: Monster AI & Spawning
**Goal**: Monsters spawn after 30s, move around, attack players

#### Subtask 1: Basic Monster Spawning
- [ ] At T=30s, spawn first monsters (1-2 initial)
- [ ] After T=60s, spawn 1 monster per living player
- [ ] Monster spawns at random location (initially anywhere in arena)
- [ ] Create monster mesh with red color + glow

**File to modify**: `server/monsterAI.js` - `checkMonsterSpawning()`
**Estimated time**: 1 day

#### Subtask 2: Monster States
Implement the ROARING → IDLE → HUNTING → LOST state machine:

```javascript
// In monsterAI.js
switch (monster.state) {
  case MONSTER_STATES.ROARING:
    // After 3 seconds, transition to IDLE
    if (timeSinceSpawn > 3) {
      monster.state = MONSTER_STATES.IDLE;
    }
    break;
    
  case MONSTER_STATES.IDLE:
    // Check if can see any player
    // If yes, enter HUNTING
    break;
    
  case MONSTER_STATES.HUNTING:
    // Move toward last seen position
    // If can't see player for 5 seconds, go to LOST
    break;
    
  case MONSTER_STATES.LOST:
    // Wander around
    // After 10 seconds, return to IDLE
    break;
}
```

**File to modify**: `server/monsterAI.js`
**Estimated time**: 1.5 days

#### Subtask 3: Monster Vision & Movement
- [ ] Implement `canMonsterSeePlayer()` - distance check only first (simplified)
- [ ] Implement `moveMonsterToward()` - basic pathfinding
- [ ] Monster moves at MONSTER_MOVEMENT_SPEED toward target
- [ ] Update monster gaze to point at target

```javascript
// Move monster toward target
function moveMonsterToward(monster, targetPos, deltaTime) {
  const dx = targetPos.x - monster.position.x;
  const dz = targetPos.z - monster.position.z;
  const distance = Math.sqrt(dx*dx + dz*dz);
  
  if (distance < 0.1) return; // at target
  
  const moveAmount = MONSTER_MOVEMENT_SPEED * deltaTime;
  monster.position.x += (dx / distance) * moveAmount;
  monster.position.z += (dz / distance) * moveAmount;
}
```

**File to modify**: `server/monsterAI.js`
**Estimated time**: 1 day

#### Subtask 4: Monster Attack & Health
- [ ] Check if monster is adjacent to player (< 2 units)
- [ ] If yes and cooldown expired, deal damage
- [ ] Damage = player.maxHealth * 0.6 (60% of max health)
- [ ] Set monster.nextAttackTime to prevent rapid attacks
- [ ] Broadcast MONSTER_ATTACK to clients

**File to modify**: `server/monsterAI.js` - `attemptMonsterAttack()`
**Estimated time**: 1 day

#### Subtask 5: Sync Monsters to Clients
- [ ] In game loop, broadcast all monster positions
- [ ] Client receives monsters list, creates/updates meshes
- [ ] Show health bar or glow effect if low health (visual feedback)

**Files to modify**: `server/index.js`, `client/main.js`
**Estimated time**: 1 day

**Testing Milestone**: Monsters spawn after 30s, move toward you, attack for damage?

---

### ☐ PHASE 4: Blind Spot Monster Spawning
**Goal**: Monsters spawn behind player's camera

#### Subtask 1: Implement Blind Spot Check
```javascript
// In monsterAI.js
function isPlayerInBlindSpot(monster, player) {
  // Vector from player to monster
  const toMonster = {
    x: monster.position.x - player.position.x,
    z: monster.position.z - player.position.z,
  };
  
  // Normalize
  const dist = Math.sqrt(toMonster.x*toMonster.x + toMonster.z*toMonster.z);
  toMonster.x /= dist;
  toMonster.z /= dist;
  
  // Player's backward direction
  const backward = {
    x: -player.gaze.x,
    z: -player.gaze.z,
  };
  
  // Dot product
  const dot = toMonster.x * backward.x + toMonster.z * backward.z;
  
  // Check if within cone (120 degree cone = ~0.5 threshold)
  return dot > 0.5;
}
```

**File to modify**: `server/monsterAI.js`
**Estimated time**: 1 day

#### Subtask 2: Spawn at Blind Spot Position
```javascript
function findMonsterSpawnPosition(player) {
  // Place monster directly behind player
  const backwardDistance = MONSTER_SPAWN_DISTANCE_FROM_PLAYER; // 60 units
  const spawnX = player.position.x - player.gaze.x * backwardDistance;
  const spawnZ = player.position.z - player.gaze.z * backwardDistance;
  
  return {
    x: spawnX,
    y: 1,
    z: spawnZ,
  };
}
```

**File to modify**: `server/monsterAI.js`
**Estimated time**: 0.5 day

#### Subtask 3: Validate Spawn Position
- [ ] Check if spawn position is inside arena
- [ ] Check if spawn position is not occupied by other monsters
- [ ] If invalid, pick random nearby position

**File to modify**: `server/monsterAI.js`
**Estimated time**: 0.5 day

**Testing Milestone**: Monsters always spawn behind you? Can't see them spawn?

---

### ☐ PHASE 5: Player Attachment (Back-to-Back)
**Goal**: Two players can attach and move together

#### Subtask 1: Attachment State Machine
Implement state transitions in `server/gameState.js`:

```javascript
// States:
ALONE → REQUEST_SENT (player A sends request)
         REQUEST_RECEIVED (player B receives)
         
If B accepts:
  BOTH → ATTACHED (now moving together)
  
If B declines or timeout:
  Both → ALONE
  
If attached and A requests control:
  A → CONTROL_REQUESTING
  B → CONTROL_RESPONDING
  
If B accepts control transfer:
  A takes control, B becomes passenger
```

**File to modify**: `server/gameState.js` - add methods:
- `requestAttachment(fromId, toId)`
- `acceptAttachment(playerId, otherPlayerId)`
- `declineAttachment(playerId)`
- `requestControl(playerId)`
- `detachPlayers(playerId)`

**Estimated time**: 1 day

#### Subtask 2: Implement V/X Keys in Controller
```javascript
// In client/playerController.js
handleVPress() {
  // Check current attachment state
  if (state === ALONE) {
    // Send attach request to nearest visible player
    network.sendAttachRequest(targetPlayerId);
  } else if (state === REQUEST_RECEIVED) {
    // Accept request
    network.sendAttachResponse(fromId, true);
  } else if (state === ATTACHED) {
    // Request control
    network.sendControlRequest(attachedPlayerId);
  }
}

handleXPress() {
  // Decline or cancel
  if (state === REQUEST_RECEIVED) {
    network.sendAttachResponse(fromId, false);
  }
}
```

**File to modify**: `client/playerController.js`
**Estimated time**: 1 day

#### Subtask 3: Double-Press U to Detach
```javascript
// Already partially implemented in playerController
// Complete the logic in handleUPress()
// Send detach message after double-press detected
```

**Estimated time**: 0.5 day

#### Subtask 4: Attached Player Movement
- [ ] When attached, both players move together
- [ ] Only one player controls movement (the other is passenger)
- [ ] Passenger can turn head (arrow keys) within 270 degree limit
- [ ] Score sharing: split collected orbs 50/50

**File to modify**: `server/gameState.js`, `server/index.js`
**Estimated time**: 1.5 days

**Testing Milestone**: Two players can attach/detach? Move together? Score splits?

---

### ☐ PHASE 6: Broadcasting (Area Messages)
**Goal**: Players can broadcast to nearby players

#### Subtask 1: Blink Timer Broadcast (I key)
```javascript
// Client - send
if (key === 'i') {
  network.sendBlinkTimerBroadcast();
}

// Server - receive
socket.on(BLINK_TIMER_BROADCAST, (data) => {
  const nearby = gameState.getNearbyPlayers(playerId, BROADCAST_RANGE);
  for (const player of nearby) {
    io.to(player.id).emit(BLINK_TIMER_BROADCAST, {
      from: playerId,
      blinkTimerRemaining: gameState.getBlinkCooldownRemaining(playerId),
    });
  }
});

// Client - receive and display
on(BLINK_TIMER_BROADCAST, (data) => {
  const msg = `${data.from}: Blink ready in ${data.blinkTimerRemaining.toFixed(1)}s`;
  ui.addBroadcast(msg);
});
```

**Files to modify**: `client/playerController.js`, `server/index.js`, `client/main.js`, `client/ui.js`
**Estimated time**: 1 day

#### Subtask 2: Monster Signal (P key)
```javascript
// Player points at monster with mouse, presses P
// Server broadcasts to nearby: "Player signals monster at direction"
// Show arrow/indicator on client

// Implementation:
// 1. Client sends direction vector (their gaze)
// 2. Server broadcasts to nearby players
// 3. Clients draw arrow in HUD pointing that direction
```

**Estimated time**: 1 day

#### Subtask 3: Orb Signal (O key)
Similar to monster signal.

**Estimated time**: 0.5 day

**Testing Milestone**: See blink timer and monster/orb signals from nearby players?

---

### ☐ PHASE 7: Arena Shrinking
**Goal**: Safe zone contracts over time, outside deals damage

#### Subtask 1: Shrinking Logic
```javascript
// In server/index.js game loop
function updateArenaShrinking(gameState, deltaTime) {
  const elapsedTime = gameState.getMatchElapsedTime();
  
  // Start shrinking at 120 seconds
  if (elapsedTime > ARENA_SHRINK_START_TIME) {
    const timeShinking = elapsedTime - ARENA_SHRINK_START_TIME;
    gameState.arenaSafeRadius = ARENA_INITIAL_RADIUS - 
                                (ARENA_SHRINK_RATE * timeShrinking);
    
    // Don't shrink below minimum
    gameState.arenaSafeRadius = Math.max(20, gameState.arenaSafeRadius);
  }
}
```

**Estimated time**: 0.5 day

#### Subtask 2: Outside Zone Damage
```javascript
// In game loop for each player
function checkArenaBoundary(gameState, player, deltaTime) {
  const dist = Math.sqrt(
    player.position.x * player.position.x +
    player.position.z * player.position.z
  );
  
  if (dist > gameState.arenaSafeRadius) {
    // Outside safe zone - take damage
    const damage = ARENA_OUTSIDE_DAMAGE_PER_SECOND * deltaTime;
    gameState.damagePlayer(player.id, damage);
  }
}
```

**Estimated time**: 0.5 day

#### Subtask 3: Visual Feedback
- [ ] Show red zone on minimap (outside safe radius)
- [ ] Red damage indicator on HUD when taking boundary damage
- [ ] Gentle fog or red vignette at screen edges when outside

**Files to modify**: `client/ui.js`, `client/main.js`
**Estimated time**: 1 day

**Testing Milestone**: Arena shrinks? Outer area damages? Minimap shows zones?

---

### ☐ PHASE 8: Audio & Polish
**Goal**: Game feels alive with sound effects

#### Subtask 1: Sound Effects
- [ ] Monster roar when spawning (or when attacking)
- [ ] Orb pickup sound (pleasant chime)
- [ ] Blink sound effect
- [ ] Player damage sound (ouch)
- [ ] Monster death sound
- [ ] UI click sounds

**Libraries**: 
- Use Web Audio API (built-in)
- Or Howler.js for easy multi-platform sound

**File to create**: `client/audio.js`
**Estimated time**: 1-2 days

#### Subtask 2: Visual Effects
- [ ] Particle burst when collecting orb
- [ ] Screen flash when taking damage
- [ ] Player glow when attached
- [ ] Monster warning indicator (red outline) when aggressive

**File to modify**: `client/scene.js`
**Estimated time**: 1-2 days

#### Subtask 3: Settings Menu
- [ ] Graphics quality slider (view distance)
- [ ] Audio volume slider
- [ ] Rebind controls

**Files to modify**: `client/index.html`, `client/ui.js`
**Estimated time**: 1 day

**Testing Milestone**: Game has immersive sound and visual feedback?

---

### ☐ PHASE 9: Advanced Features (Optional)
These add polish but aren't critical:

- [ ] **Minimap fog-of-war**: Only show what player has seen
- [ ] **Advanced monster AI**: Pathfinding around obstacles
- [ ] **Weapon system**: Instead of blink, use weapons to damage monsters
- [ ] **Power-ups**: Special orbs that grant temporary abilities
- [ ] **Team mode**: Attached players vs other teams
- [ ] **Replays**: Record and playback matches
- [ ] **Leaderboards**: Track top scores

---

### ☐ PHASE 10: Publishing to itch.io
**Goal**: Game live on web

- [ ] Test all features work together
- [ ] Optimize assets (reduce model complexity)
- [ ] Build: `npm run build`
- [ ] Create itch.io account
- [ ] Upload build + instructions
- [ ] Configure LAN networking info in description
- [ ] Share with friends!

**Estimated time**: 1-2 days

---

## Quick Reference: Files to Modify by Feature

| Feature | Files to Modify |
|---------|-----------------|
| WASD Movement | client/playerController.js |
| Mouse Look | client/playerController.js |
| Blink System | server/gameState.js, server/index.js, client/ui.js |
| Orbs | server/index.js, client/scene.js, client/ui.js |
| Monster Spawning | server/monsterAI.js |
| Monster AI | server/monsterAI.js, server/index.js |
| Blind Spots | server/monsterAI.js |
| Attachment | server/gameState.js, client/playerController.js, server/index.js |
| Broadcasts | client/playerController.js, server/index.js, client/ui.js |
| Arena Shrinking | server/index.js, client/ui.js |
| Audio | client/audio.js (create new) |
| UI Improvements | client/ui.js, client/index.html |

---

## Testing Strategies

### Unit Testing (Individual Features)
```javascript
// Test blind spot calculation
const player = { position: {x:0,y:1,z:0}, gaze: {x:0,y:0,z:1} };
const monster = { position: {x:0,y:1,z:-60} };
console.assert(
  isPlayerInBlindSpot(monster, player) === true,
  "Monster behind player should be in blind spot"
);
```

### Integration Testing (Multiple Features)
1. Start server
2. Connect 2 players
3. Both collect orbs
4. Both attach
5. Monster spawns
6. Monster attacks attached pair
7. Detach
8. Move to arena edge and take damage

### Performance Testing
- Server can handle 8 players + 8 monsters + 15 orbs
- 60 FPS on client
- < 100ms latency on LAN

---

## Common Pitfalls & Solutions

| Problem | Solution |
|---------|----------|
| "Monster spawns on me" | Check blind spot math; increase spawn distance |
| "Jerky movement" | Increase NETWORK_TICK_RATE or implement interpolation |
| "Connections drop" | Check firewall; verify server IP:port reachable |
| "Weird attachment bugs" | Draw state machine diagram; validate transitions |
| "Performance drop with >4 players" | Profile with DevTools; reduce mesh complexity |

---

## Questions to Answer Before Each Phase

1. **What's my specific goal?** (Be specific!)
2. **What files do I need to modify?**
3. **How will I test it?**
4. **What could go wrong?**
5. **When am I done?**

Good luck! 🚀
