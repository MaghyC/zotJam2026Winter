# System Architecture Diagrams

## 1. Overall System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        BROWSER (Client)                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ JavaScript Game (client/main.js)                         │   │
│  ├──────────────────────────────────────────────────────────┤   │
│  │                                                           │   │
│  │  ┌─────────────────┐  ┌──────────┐  ┌──────────────┐    │   │
│  │  │ PlayerController│  │ Network  │  │ Scene (3D)  │    │   │
│  │  ├─────────────────┤  ├──────────┤  ├──────────────┤    │   │
│  │  │- WASD input     │  │-Socket.IO│  │- Three.js  │    │   │
│  │  │- Mouse look     │  │-Send pos │  │- Render    │    │   │
│  │  │- Position calc  │  │-Recv state   │- Meshes   │    │   │
│  │  └─────────────────┘  └────┬─────┘  └──────────────┘    │   │
│  │                             │                             │   │
│  │                       ┌─────▼─────┐                       │   │
│  │                       │    UI      │                       │   │
│  │                       ├────────────┤                       │   │
│  │                       │- HUD       │                       │   │
│  │                       │- Minimap   │                       │   │
│  │                       │- Messages  │                       │   │
│  │                       └────────────┘                       │   │
│  │                                                           │   │
│  └──────────────────────────────────────────────────────────┘   │
│                             │ WebSocket                        │   │
└─────────────────────────────┼────────────────────────────────┘
                              │
                              │ Socket.IO
                              │ (bidirectional TCP/WebSocket)
                              │
┌─────────────────────────────┼────────────────────────────────┐
│                             ▼                                │
│  Node.js Game Server                                         │
├────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Express HTTP Server (port 3000)                      │  │
│  │ + Socket.IO WebSocket Server                         │  │
│  └────────────────────┬─────────────────────────────────┘  │
│                       │                                     │
│  ┌────────────────────▼─────────────────────────────────┐  │
│  │ socket.on(event) Handlers                            │  │
│  │- JOIN_LOBBY, PLAYER_POSITION, BLINK_ACTION, etc.   │  │
│  └────────────────────┬─────────────────────────────────┘  │
│                       │                                     │
│  ┌────────────────────▼─────────────────────────────────┐  │
│  │ LobbyManager (multiple concurrent lobbies)           │  │
│  │- lobbies: Map<lobbyId, GameState>                   │  │
│  │- findAvailableLobby() / createLobby()               │  │
│  └────────────────────┬─────────────────────────────────┘  │
│                       │                                     │
│  ┌────────────────────▼─────────────────────────────────┐  │
│  │ GameState (per-lobby game data)                      │  │
│  ├──────────────────────────────────────────────────────┤  │
│  │ - players: Map<playerId, playerData>               │  │
│  │ - monsters: Map<monsterId, monsterData>            │  │
│  │ - orbs: Map<orbId, orbData>                         │  │
│  │ - arenaSafeRadius, matchStartTime, etc.             │  │
│  └────────────────────┬─────────────────────────────────┘  │
│                       │                                     │
│       ┌───────────────┼───────────────┐                     │
│       │               │               │                     │
│  ┌────▼────┐  ┌──────▼──────┐  ┌─────▼──────────┐          │
│  │ MonsterAI   │ Player Update │ Orb Collection │          │
│  │ - State     │ - Position    │ - Validation   │          │
│  │ - Spawning  │ - Rotation    │ - Scoring      │          │
│  │ - Vision    │ - Gaze        │ - Collection   │          │
│  │ - Attacks   │ - Health      │                │          │
│  └────────────┘ └───────────────┘ └────────────────┘          │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Game Loop (30 Hz = every 33ms)                       │  │
│  ├──────────────────────────────────────────────────────┤  │
│  │ 1. updateAllMonsters(deltaTime)                     │  │
│  │ 2. checkArenaBoundary()                              │  │
│  │ 3. applyDamage/Healing                               │  │
│  │ 4. broadcastLobbyState() ──→ All clients             │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Data Flow: Player Movement

```
┌─────────────┐
│ Player      │
│ presses 'W' │
└──────┬──────┘
       │
       ▼
┌──────────────────────────────────┐
│ PlayerController.update()         │
│ detects WASD in this.keys['w']   │
└──────────┬───────────────────────┘
           │
           ▼
┌──────────────────────────────────────────┐
│ updateMovement(deltaTime)                │
│ Calculates new position based on:        │
│  - movement speed                        │
│  - player rotation (facing direction)    │
│  - elapsed time                          │
└──────────┬───────────────────────────────┘
           │
           ▼
┌──────────────────────────────────┐
│ this.position updated locally    │
│ (client-side prediction)         │
└──────────┬───────────────────────┘
           │
           ▼
┌──────────────────────────────────────────┐
│ NetworkManager.sendPlayerUpdate()        │
│ Socket.emit(PLAYER_POSITION, {           │
│   position, rotation, gaze               │
│ })                                       │
│ (Rate-limited: 30 updates/sec max)       │
└──────────┬───────────────────────────────┘
           │ WebSocket
           │
           ▼
┌──────────────────────────────────────────┐
│ [SERVER]                                 │
│ socket.on(PLAYER_POSITION, data)         │
└──────────┬───────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────────┐
│ GameState.updatePlayerTransform()        │
│ player.position = data.position          │
│ player.rotation = data.rotation          │
│ player.gaze = data.gaze                  │
│                                          │
│ Validates:                               │
│  - Is position inside arena?             │
│  - Is movement reasonable? (not cheating)│
└──────────┬───────────────────────────────┘
           │
           │ (30 Hz game loop)
           ▼
┌──────────────────────────────────────────┐
│ broadcastLobbyState()                    │
│ io.to(lobbyId).emit(LOBBY_STATE, {       │
│   players: [{ id, position, ... }, ...], │
│   monsters: [...],                       │
│   orbs: [...]                            │
│ })                                       │
│                                          │
│ Sent to ALL players in lobby             │
└──────────┬───────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────────┐
│ [CLIENT]                                 │
│ main.js receives LOBBY_STATE             │
│ handleLobbyStateUpdate(data)             │
└──────────┬───────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────────┐
│ Update all player meshes:                │
│ for each player in data.players {        │
│   scene.updatePlayerMesh(id, pos, rot)  │
│ }                                        │
└──────────┬───────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────────┐
│ scene.render()                           │
│ Three.js renders all meshes              │
└──────────┬───────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────────┐
│ Player sees all movement on screen       │
│ (including own position from server)     │
└──────────────────────────────────────────┘
```

---

## 3. Monster AI State Machine

```
                        SPAWN EVENT
                             │
                             ▼
                    ┌─────────────────┐
                    │     ROARING     │
                    │                 │
                    │ Duration: 3s    │
                    │ Cannot move     │
                    │ Making sound    │
                    └────────┬────────┘
                             │
                    (3s elapsed)
                             │
                             ▼
                    ┌─────────────────┐          ┌────────────────────┐
                    │      IDLE       │◄─────────│  Can see player?   │
                    │                 │          │  Distance < 30m?   │
    ┌──────────────→│ Patrolling      │          └────────────────────┘
    │               │ Scanning        │                    Yes
    │               │ for targets     │                    │
    │               └─────────────────┘                    │
    │                      ▲                              No
    │                      │                              │
    │                 ┌────┴───────────────┐              │
    │                 │ (Lost player &     │              │
    │                 │  10s elapsed)      │              ▼
    │                 │                    │     ┌─────────────────┐
    │                 │                    │     │     HUNTING     │
    │                 │                    │     │                 │
    │                 │                    │     │ Chasing player  │
    │                 │                    │     │ Moving toward   │
    │                 │                    │     │ Attack on hit   │
    │                 └────────────────────┘     └────────┬────────┘
    │                                                     │
    │                                        ┌────────────┴──────────────┐
    │                                        │                           │
    │                                 Can see player?            Player distance
    │                                        │                     > 50m?
    │                                       Yes                   Behind obstacle?
    │                                        │                           │
    │                                        └──────────────┐            │
    │                                                       │            │
    │                                         ┌─────────────▼──────┐     │
    │                                         │       LOST         │     │
    │                                         │                    │     │
    │                                         │ Searching nearby   │     │
    │                                         │ for 10s            │     │
    │                                         │                    │     │
    │                                         └────────────────────┘     │
    │                                                │                   │
    │                                                │ (10s passed       │
    │                                                │  or timeout)      │
    │                                                │                   │
    └────────────────────────────────────────┬──────┘               (Continue
                                             │                      ├─hunting)
                                             │                      │
                                             └──────────────────────┘
```

---

## 4. Player Attachment State Machine

```
                        [ALONE]
                          │
                ┌─────────┼─────────┐
                │         │         │
              V press     │         │
                │         │         │
                ▼         │         │
         ┌──────────────┐ │         │
         │ REQUEST_SENT │ │         │
         └──────┬───────┘ │         │
                │ (timeout│         │
                │  5sec)  │         │
                ▼         ▼         │
          DECLINE    ┌──────────────────────┐
          [ALONE]    │  REQUEST_RECEIVED    │
                     └──────┬──────┬────────┘
                            │      │
                       V press    X press
                       (accept)   (decline)
                            │      │
                            ▼      ▼
                        ┌────────┐ [ALONE]
                        │ATTACHED│
                        └────┬───┘
                             │
                     ┌───────┴────────┐
                     │                │
                  U key          N key
                (x2 press)    (request control)
                     │                │
                     ▼                ▼
                 [ALONE]      ┌─────────────────────┐
                              │ CONTROL_REQUESTING  │
                              └──────┬──────┬───────┘
                                     │      │
                          V press     │      │ X press
                          (accept)    │      │ (timeout 5s)
                                     ▼      ▼
                           [ATTACHED]    [ATTACHED]
                        (but B controls)  (A controls)
```

---

## 5. Networking Event Flow

```
CLIENT A                      SERVER                    CLIENT B
  │                             │                         │
  │───PLAYER_POSITION──────────→│                         │
  │  { pos, rot, gaze }         │                         │
  │                             ├─ Validate             │
  │                             ├─ Update GameState     │
  │                             │                       │
  │                             │ (30 Hz game loop)     │
  │                             │ updateAllMonsters()   │
  │                             │ checkBoundaries()     │
  │                             │ broadcastLobbyState() │
  │                             │                       │
  │←──LOBBY_STATE───────────────┼──LOBBY_STATE────────→│
  │ { players[], monsters[], │     { players[], monsters[], │
  │   orbs[], gameTime, ... }│       orbs[], gameTime, ... }│
  │                           │                           │
  │───BLINK_ACTION────────────→│                         │
  │ {}                          │                         │
  │                             ├─ Check cooldown      │
  │                             ├─ Reset blink timer   │
  │                             │                       │
  │←──LOBBY_STATE───────────────┼──LOBBY_STATE────────→│
  │ (updated w/ new timer)      │ (updated w/ new timer)│
  │                             │                       │
  │───COLLECT_ORB─────────────→│                         │
  │ { orbId }                   │                         │
  │                             ├─ Remove orb          │
  │                             ├─ Add score           │
  │                             │                       │
  │←──ORB_COLLECTED────────────→│                         │
  │ { orbId, playerId, points } │ { orbId, playerId, points }│
  │                             │                       │
  │ (Process input locally)     │                       │
  │ Send every 30/sec          │ Send every 30/sec     │
  │ Render at 60 FPS           │ Render at 60 FPS      │
```

---

## 6. 3D Arena Layout (Top-Down View)

```
                    Outer Wall (Coliseum Wall)
                    ─────────────────────────
                 ╱                           ╲
              ╱                               ╲
           ╱                                   ╲
         ╱                                     ╲
       ╱                                       ╲
      │   ★ Orb spawn locations               │
      │         ★                              │
      │     ★       ★                          │
      │                                        │
      │   ┌─ Obstacle  ┌─ Obstacle            │
      │   │            │                      │
      │   ▼            ▼                      │
      │   █  ████      █                      │
      │   ██ █         █      ROAR!  ◄────── │ Roaring Monster
      │   █  ████      █  ╲                  │   (red, 3s delay)
      │   █  █          █   ╲ Red dot on     │
      │   █  █         ███   ╲ minimap       │
      │          █████                       │
      │     ╱─── Safe Zone ───╲              │
      │   ╱  (shrinking boundary) ╲          │
      │  │                         │ ◄─────  PLAYER (blue)
      │  │      Shrinking Zone   │ │         Top-down view
      │  │      (taking damage)  │ │         X = player position
      │   ╲     █    █    █    ╱             Each █ = obstacle
      │     ╲─────────────────╱              Each ★ = orb
      │                                        Each Monster = AI
      │     ◯ ← Monster in blind spot         Each ◯ = monster
      │       (spawning here!)
      │
      │
       ╲                                     ╱
        ╲                                   ╱
         ╲                                 ╱
          ╲                               ╱
            ╲                           ╱
              ╲_____________________╱

Legend:
  X        = Player position
  █        = Obstacles (cover)
  ★        = Orbs (collectibles)
  ROAR     = Monster roaring (can't move yet)
  ◯        = Monster spawning in blind spot
  ─ ─ ─    = Safe zone boundary
  ─────    = Shrinking danger zone
  │││││    = Outer coliseum wall
```

---

## 7. HUD Layout (Screen View)

```
┌────────────────────────────────────────────────────────────────────┐
│                                                                    │
│  HP: 85/100                                    [MINIMAP]          │
│  Score: 250                                    ┌──────────┐        │
│  Blink: 3.4s                                   │   G      │        │
│  Status: Attached                              │ B  X  M  │ ◄─ Minimap (200x200px)
│                                                │   P      │        │
│  ◄────────────────────────────────────────►   └──────────┘        │
│       3D GAME VIEW                                                  │
│                                                                    │
│                         [Coliseum arena                            │
│                          with 3D players,                          │
│                          monsters, orbs                            │
│                          from first-person                         │
│                          perspective]                              │
│                                                                    │
│                                                                    │
│                                                                    │
│                        CENTER CROSSHAIR                           │
│                        (for aiming at orbs                        │
│                         or targeting players)                     │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘

Minimap Legend:
  X  = Your position (center)
  ◯  = Facing direction arrow
  B  = Nearby blue players
  M  = Monsters (red, first 10s)
  G  = Green circle = arena boundary
  P  = Purple circle = shrinking danger zone
  ★  = Yellow dots = orbs

HUD Elements:
  Top-left: Health, Score, Blink Timer, Attachment Status
  Top-right: Minimap
  Center: 3D view with crosshair
  Scrolling: Broadcast messages fade in/out
```

---

## 8. Communication Sequence: Attachment

```
Player A                    Server                    Player B
  │                           │                         │
  │─── ATTACH_REQUEST ───────→│                         │
  │ (targeting Player B)      │                         │
  │                           │─ Validate distance     │
  │                           │─ Check not attached    │
  │                           │─ Set state to REQUEST  │
  │                           │                         │
  │←─ Broadcast ──────────────┼─── ATTACH_REQUEST ────→│
  │  "Request sent"           │   { from: A }          │
  │                           │                         │
  │                           │ Player B sees popup:   │
  │                           │ "Player A wants to     │
  │                           │  attach. Press V to    │
  │                           │  accept or X to        │
  │                           │  decline"              │
  │                           │                         │
  │                           │←─── ATTACH_RESPONSE ───│
  │                           │ { accepted: true }     │
  │                           │                         │
  │                           │─ Set A.attachedTo = B  │
  │                           │─ Set B.attachedTo = A  │
  │                           │─ Both state = ATTACHED │
  │                           │                         │
  │←─ Broadcast ──────────────┼─── Broadcast ────────→│
  │  "Attached to B!"         │   "Attached to A!"    │
  │                           │                         │
  │ Both players now move     │ Position/rotation      │
  │ together. Score splits    │ synchronized for both  │
  │ 50/50 on orb collection   │ players                │
  │                           │                         │
  │─── DETACH (U x2) ────────→│                         │
  │                           │─ Set attachedTo = null │
  │                           │─ State = ALONE         │
  │                           │                         │
  │←─ Broadcast ──────────────┼─── Broadcast ────────→│
  │  "Detached!"              │   "Detached!"         │
  │                           │                         │
  │ Independent again         │ Can attach to others   │
```

---

## 9. Client-Server Reconciliation Pattern

```
┌─────────────────────────────────────────────────────────────────┐
│ Client-Side Prediction + Server Reconciliation Pattern         │
└─────────────────────────────────────────────────────────────────┘

TIME ───────────────────────────────────────────────────────────→

T0: Player presses 'W'
    ├─ Client: Immediately move locally
    │  (optimistic update)
    │
    └─ Server: Doesn't know yet
       
       Client State:  { x: 0 → 5 }
       Server State:  { x: 0 }
       ├─ Difference: +5 (prediction)
       └─ Server will confirm or correct

T1: Network message arrives at server
    ├─ Server validates: "Is this movement valid?"
    │  - In bounds? YES
    │  - Reasonable? YES
    │  - Not cheating? YES
    │
    └─ Server updates: { x: 5 }

T2: Server broadcasts back to all clients
    ├─ Server sends: "Player at x: 5"
    │
    └─ Client receives
       ├─ Local was:    x: 5
       ├─ Server says:  x: 5
       ├─ Difference:   0 (perfect prediction!)
       └─ No correction needed

BUT if prediction was wrong:
    Client predicted:  x: 10 (too much)
    Server corrected:  x: 8 (collision detected)
    Difference: -2
    → Snap back or smoothly interpolate to x: 8

RESULT:
    ✅ Movement feels immediate (no lag)
    ✅ Server validates everything (no cheating)
    ✅ Smooth interpolation if correction needed
```

---

This document provides visual representations of key system concepts.
For detailed explanations, see SETUP_GUIDE.md and QUICK_REFERENCE.md.
