# Quick Reference Guide

## File-at-a-Glance

### Server Files (Backend - Node.js)

**server/index.js** - Main entry point
```javascript
// Responsibilities:
// - Start Express HTTP server on port 3000
// - Create Socket.IO WebSocket server
// - Handle player connections/disconnections
// - Process all game events (movement, blink, collect, attach, etc.)
// - Run 30 Hz game loop
// - Broadcast LOBBY_STATE to all players

Key Functions:
- connection → new player joins
- PLAYER_POSITION → receive position update
- BLINK_ACTION → process blink
- COLLECT_ORB → process collection
- ATTACH_REQUEST → initiate attachment
- ATTACH_RESPONSE → respond to attachment
- DETACH → break attachment
- disconnect → player left game
```

**server/gameState.js** - Game state for one lobby
```javascript
// Represents all data for a single match
// Each lobby gets its own GameState instance

Key Classes:
- GameState(lobbyId)
  - players: Map<playerId, playerData>
  - monsters: Map<monsterId, monsterData>
  - orbs: Map<orbId, orbData>
  - arenaSafeRadius: number
  - matchStartTime: timestamp

Key Methods:
- addPlayer(id, data) - add player to lobby
- updatePlayerTransform(id, pos, rot, gaze) - sync position
- spawnMonster(id, data) - create new monster
- collectOrb(orbId) - remove orb, return points
- damagePlayer(id, amount) - reduce health
- requestAttachment(fromId, toId) - start attachment
- acceptAttachment(resId, reqId) - complete attachment
- getNearbyPlayers(fromId, radius) - for broadcasts
```

**server/monsterAI.js** - Monster behavior
```javascript
// Implements monster AI state machine and spawning

Key Classes:
- MonsterAI(gameState, gameLoop)

Key Methods:
- updateAllMonsters(deltaTime) - main update called every tick
- updateSingleMonster(monster, deltaTime) - handle one monster
- handleRoaringState() - immobile, making noise (3s)
- handleIdleState() - patrolling, scanning for players
- handleHuntingState() - actively chasing player
- handleLostState() - searching after losing player
- canMonsterSeePlayer(m, p) - vision check
- isPlayerInBlindSpot(m, p) - check if behind player
- findMonsterSpawnPosition(player) - get blind spot position
- moveMonsterToward(m, target, dt) - pathfinding
- attemptMonsterAttack(m, p, t) - damage player
- checkMonsterSpawning() - spawn new monsters based on time
```

**server/lobbyManager.js** - Multi-lobby management
```javascript
// Manages multiple simultaneous game lobbies

Key Classes:
- LobbyManager(maxLobbies, maxPlayersPerLobby)

Key Methods:
- createLobby() - make new lobby
- getLobby(lobbyId) - retrieve lobby
- findAvailableLobby() - find lobby with space or create new
- addPlayerToLobby(id, playerId, data) - add player
- removePlayerFromLobby(id, playerId) - remove player
- getLobbiesStats() - debug info
```

**server/config.js** - Server configuration
```javascript
// Centralized settings

Export:
- SERVER_CONFIG object
  - PORT: 3000
  - HOST: '0.0.0.0'
  - MAX_LOBBIES: 10
  - MAX_PLAYERS_PER_LOBBY: 8
  - DEBUG: true

- debugLog(message, data?) - conditional logging
- getServerTime() - Date.now() wrapper
```

---

### Client Files (Frontend - Browser/JavaScript)

**client/main.js** - Game bootstrap
```javascript
// Entry point that initializes all systems

Key Classes:
- Game class
  - network: NetworkManager
  - scene: Scene (Three.js)
  - controller: PlayerController
  - ui: UI
  - gameLoop() - 60 FPS main loop

Lifecycle:
1. Initialize UI
2. Initialize 3D scene
3. Connect to server
4. Initialize controller
5. Set up event listeners
6. Start render loop
```

**client/network.js** - WebSocket communication
```javascript
// Socket.IO client - handles all network communication

Key Classes:
- NetworkManager(serverUrl)
  - socket: io connection
  - playerId: unique player ID
  - lobbyId: current lobby
  - isConnected: boolean

Key Methods:
- connect(playerName) - connect to server
- sendPlayerUpdate(pos, rot, gaze) - 30 Hz position updates
- sendBlink() - send blink action
- sendCollectOrb(orbId) - collect orb
- sendAttachRequest(targetId) - request attachment
- sendAttachResponse(fromId, accepted) - accept/decline
- sendDetach() - detach from partner
- sendBlinkTimerBroadcast() - broadcast to area
- on(eventType, callback) - listen for events
```

**client/scene.js** - 3D graphics (Three.js)
```javascript
// Manages 3D rendering using Three.js

Key Classes:
- Scene class
  - scene: THREE.Scene
  - camera: THREE.PerspectiveCamera
  - renderer: THREE.WebGLRenderer
  - playerMeshes: Map<playerId, THREE.Mesh>
  - monsterMeshes: Map<monsterId, THREE.Mesh>
  - orbMeshes: Map<orbId, THREE.Mesh>

Key Methods:
- initialize(canvas) - setup WebGL
- setupLights() - add lighting to scene
- createColiseum() - build arena
- createPlayerMesh(id, pos) - make player object
- createMonsterMesh(id, pos) - make monster object
- createOrbMesh(id, pos) - make collectible
- updatePlayerMesh(id, pos, rot) - update player
- updateMonsterMesh(id, pos) - update monster
- updateCamera(pos, rot) - camera follows player
- render() - draw current frame
```

**client/playerController.js** - Input & movement
```javascript
// Local player control - input handling and movement prediction

Key Classes:
- PlayerController(scene, network)
  - position: { x, y, z }
  - rotation: { x (pitch), y (yaw), z (roll) }
  - gaze: { x, y, z } - normalized direction facing
  - keys: {} - held keys
  - isAttached: boolean

Key Methods:
- setupInputListeners() - keyboard & mouse
- handleKeyDown(event) - discrete key presses (R, V, X, U, I, etc.)
- update(deltaTime) - main update called each frame
- updateMovement(dt) - WASD movement with facing direction
- updateRotation() - mouse look (pitch/yaw)
- updateGaze() - calculate forward-facing direction vector
- setPosition(pos) - server correction
- getState() - return current position/rotation/gaze
```

**client/ui.js** - HUD & minimap
```javascript
// User interface - HUD elements and minimap

Key Classes:
- UI class
  - hudElements: { health, score, blinkTimer, attachStatus }
  - minimapCanvas, minimapCtx
  - messagesContainer

Key Methods:
- updateHealth(current, max) - update HP display
- updateScore(score) - update score display
- updateBlinkTimer(remaining) - show blink cooldown
- updateAttachmentStatus(status) - show attachment state
- drawMinimap(playerPos, playerRot, gameState) - draw minimap
  - Shows: arena, safe zone, players, monsters, orbs, facing dir
- addBroadcast(text) - show broadcast message
- showMessage(text, duration) - show temporary message
- showLoading(text) - show loading screen
- hideLoading() - hide loading screen
```

**client/index.html** - Web page
```html
<!-- Main page structure -->
- Canvas element (3D rendering)
- HUD div (health, score, blink timer, status)
- Minimap canvas (200x200 px)
- Messages div (broadcasts)
- Loading screen
- Bundled JavaScript (bundle.js)
```

---

### Shared Files (Both Client & Server)

**shared/constants.js** - Game constants
```javascript
// All tunable game values in one place

Movement:
- PLAYER_MOVEMENT_SPEED_FORWARD
- PLAYER_MOVEMENT_SPEED_BACKWARD
- PLAYER_MOVEMENT_SPEED_STRAFE

Blink:
- BLINK_COOLDOWN_DURATION (8 seconds)
- BLINK_TIMER_PRECISION (0.1 seconds)

Orbs:
- ORB_COLLECTION_RANGE (3 units)
- ORB_SCORE_VALUE (10 points)
- ORB_SPAWN_COUNT (15 per match)

Arena:
- ARENA_INITIAL_RADIUS
- ARENA_SHRINK_START_TIME
- ARENA_SHRINK_RATE
- ARENA_OUTSIDE_DAMAGE_PER_SECOND

Monsters:
- MONSTER_SPAWN_DELAY (30s before first spawn)
- MONSTER_SPAWN_RATIO_TIME (60s, then 1 per player)
- MONSTER_ROAR_DURATION (3s immobile)
- MONSTER_VISION_RANGE (30m)
- MONSTER_HUNTING_MODE_RANGE (30m)
- MONSTER_ATTACK_DAMAGE_PERCENT (0.6 = 60%)
- MONSTER_BLIND_SPOT_CONE_ANGLE (120 degrees)

Network:
- NETWORK_TICK_RATE (30 Hz)
- NETWORK_INTERPOLATION_FACTOR (0.15)

MESSAGE_TYPES enum:
- CREATE_LOBBY, JOIN_LOBBY, LEAVE_LOBBY, LOBBY_STATE
- PLAYER_POSITION, PLAYER_ROTATION, PLAYER_HEALTH, PLAYER_DIED
- COLLECT_ORB, ORB_COLLECTED
- BLINK_ACTION, BLINK_TIMER_SYNC
- MONSTER_SPAWNED, MONSTER_UPDATE, MONSTER_ATTACK
- ATTACH_REQUEST, ATTACH_RESPONSE, CONTROL_REQUEST, CONTROL_RESPONSE, DETACH
- BLINK_TIMER_BROADCAST, ORB_SIGNAL, MONSTER_SIGNAL
- GAME_START, GAME_END, ARENA_UPDATE

State enums:
- PLAYER_STATES: ALIVE, DEAD, RESPAWNING
- MONSTER_STATES: ROARING, IDLE, HUNTING, LOST
- ATTACHMENT_STATES: ALONE, REQUEST_SENT, REQUEST_RECEIVED, ATTACHED, CONTROL_REQUESTING, CONTROL_RESPONDING, CONTROL_ACTIVE
```

**shared/types.js** - Type definitions
```javascript
// JSDoc type hints for code completion

Documented Types:
- Vector3: { x, y, z }
- Player: { id, name, position, rotation, gaze, health, maxHealth, state, score, blinkCooldownEnd, attachedTo, attachmentState, lastAttackTime }
- Orb: { id, position, value, collected }
- Monster: { id, position, targetPosition, gaze, health, maxHealth, state, targetPlayerId, spawnTime, nextAttackTime, lastSeenPlayerPosition, lastSightTime }
- Lobby: { id, playerIds[], active, startTime, endTime, orbs[], monsters[], arenaSafeRadius, gameState }
- NetworkMessage: { type, payload, timestamp }
```

---

## Data Flow Examples

### Example 1: Player Movement
```
1. Player presses 'W'
   ↓
2. PlayerController detects key
   ↓
3. updateMovement() changes this.position.x/z
   ↓
4. update() calls network.sendPlayerUpdate()
   ↓
5. Socket.IO sends PLAYER_POSITION to server (30/sec, rate-limited)
   ↓
6. Server receives, validates bounds, updates gameState.players[id].position
   ↓
7. Game loop broadcasts LOBBY_STATE with all player positions
   ↓
8. Client receives LOBBY_STATE
   ↓
9. main.js updates all player meshes with new positions
   ↓
10. scene.render() draws updated positions
    ↓
11. Next frame shows player in new position
```

### Example 2: Orb Collection
```
1. Player collects orb
   ↓
2. PlayerController detects proximity + click
   ↓
3. network.sendCollectOrb(orbId)
   ↓
4. Server receives COLLECT_ORB
   ↓
5. gameState.collectOrb(orbId) - marks collected
   ↓
6. gameState.addScore(playerId, orbValue) - add points
   ↓
7. Server broadcasts ORB_COLLECTED to all players
   ↓
8. Client receives, removes orb mesh from scene
   ↓
9. UI updates score display
   ↓
10. All players see orb disappear, collector's score increase
```

### Example 3: Monster Attack
```
1. Monster enters HUNTING state
   ↓
2. AI moves monster toward player
   ↓
3. Monster is adjacent (< 2 units away)
   ↓
4. Server checks attack cooldown
   ↓
5. attemptMonsterAttack() applies damage
   ↓
6. player.health -= (maxHealth * 0.6)
   ↓
7. Server broadcasts LOBBY_STATE with updated health
   ↓
8. Client receives, updates health in HUD
   ↓
9. If health <= 0, player.state = DEAD
   ↓
10. Game loop stops updating dead player
```

---

## Networking Event Summary

### From Client to Server
| Event | Sent By | Frequency | Payload |
|-------|---------|-----------|---------|
| JOIN_LOBBY | network.js | Once | { playerName } |
| PLAYER_POSITION | network.js | 30/sec | { position, rotation, gaze } |
| BLINK_ACTION | playerController.js | On-demand | {} |
| COLLECT_ORB | playerController.js | On-demand | { orbId } |
| ATTACH_REQUEST | playerController.js | On-demand | { targetPlayerId } |
| ATTACH_RESPONSE | playerController.js | On-demand | { from, accepted } |
| DETACH | playerController.js | On-demand | {} |
| BLINK_TIMER_BROADCAST | playerController.js | On-demand | {} |

### From Server to Client
| Event | Sent By | Frequency | Payload |
|-------|---------|-----------|---------|
| LOBBY_STATE | index.js | 30/sec | { players[], monsters[], orbs[], gameTime, arenaSafeRadius } |
| ORB_COLLECTED | index.js | On-demand | { orbId, playerId, points } |
| BLINK_ACTION | index.js | On-demand | { playerId } |
| MONSTER_ATTACK | index.js | On-demand | { monsterId, targetId } |
| ATTACH_REQUEST | index.js | On-demand | { from, to } |
| ATTACH_RESPONSE | index.js | On-demand | { from, to, accepted } |
| BLINK_TIMER_BROADCAST | index.js | On-demand | { from, blinkTimerRemaining } |

---

## State Transitions

### Monster AI State Machine
```
                          (spawn)
                            ↓
                    ┌──────────────┐
                    │   ROARING    │ 3s - cannot move
                    └──────┬───────┘
                           │ (after 3s roar)
                           ↓
                    ┌──────────────┐
        ┌───────────│    IDLE      │◄───────────┐
        │           │   patrolling  │           │
        │           └──────┬───────┘           │ (lost player)
        │                  │ (sees player)      │
        │                  │ (in range)         │
        │                  ↓                    │
        │           ┌──────────────┐           │
        │           │   HUNTING    ├───────────┘
        │           │   chasing    │ (5s no sight)
        │           └──────────────┘
        │                  ↑
        │                  │
        │           ┌──────────────┐
        └──────────→│    LOST      │
                    │  searching   │ (10s timeout)
                    └──────────────┘
```

### Attachment State Machine
```
                         (V press)
                           ↓
    ┌──────────┐    ┌───────────────┐
    │  ALONE   │───→│ REQUEST_SENT  │
    └──────────┘    └────────┬──────┘
         ↑                   │
         │          (timeout/decline)
         │                   │
         │           ┌───────▼─────────┐
         │           │REQUEST_RECEIVED │
         │           └────────┬────────┘
         │                    │ (V press - accept)
         │                    ↓
         │           ┌──────────────┐
         └───────────│  ATTACHED    │
                     │ (moving      │
                     │  together)   │
                     └──────────────┘
                            │
                    (N press - request control)
                            ↓
                     ┌──────────────┐
                     │CONTROL_REQ   │
                     └────────┬─────┘
                              │
         (Auto-decline after 5s or X press)
                              │
                              └──→ Back to ATTACHED
```

---

## Performance Targets

| Metric | Target | Current |
|--------|--------|---------|
| Client FPS | 60 | Good (requestAnimationFrame) |
| Server Tick Rate | 30 Hz | ✓ Set in constants |
| Max Players per Lobby | 8 | ✓ Enforced |
| Max Lobbies | 10 | ✓ Enforced |
| Network Latency | < 100ms LAN | Depends on network |
| Player Position Update Rate | 30/sec | ✓ Rate-limited |
| Memory per Player | < 1KB | Estimate: ~500 bytes |

---

## Debugging Checklist

When something doesn't work:

- [ ] Check browser console (F12 → Console) for errors
- [ ] Check server console for logs and errors
- [ ] Visit http://localhost:3000/admin/stats to see server state
- [ ] Verify network messages using browser Network tab (F12 → Network)
- [ ] Add debugLog() calls to trace code execution
- [ ] Use a second browser tab to test 2-player scenarios
- [ ] Check that all required files exist in `/dist` after `npm run build`
- [ ] Verify firewall allows port 3000
- [ ] Test with simple scenario first (movement only, then add features)

---

## Git Workflow

Save your progress frequently:

```bash
git add .
git commit -m "Feature description: what was implemented/fixed"
git push
```

Suggested commits per phase:
- Phase 1: "Core infrastructure: server, client, networking"
- Phase 2: "Orbs and blink system implemented"
- Phase 3: "Monster AI and spawning complete"
- Phase 4: "Blind spot spawning working"
- Phase 5: "Player attachment mechanic added"
- And so on...

---

This reference should help you quickly navigate the codebase! 🎯
