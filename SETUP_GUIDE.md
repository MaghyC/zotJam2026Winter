# Multi-Lobby Blink Royale - Complete Setup & Implementation Guide

## Table of Contents
1. [Project Setup & Installation](#project-setup)
2. [Architecture Overview](#architecture-overview)
3. [File Structure Explanation](#file-structure)
4. [Running the Game Locally](#running-locally)
5. [Implementation Roadmap](#implementation-roadmap)
6. [Key Concepts Explained](#key-concepts)
7. [Publishing to itch.io](#publishing-to-itchio)

---

## Project Setup & Installation

### Prerequisites
- **Node.js** (v16 or later) - Download from https://nodejs.org/
- **npm** (comes with Node.js)
- **A text editor** - VS Code recommended (https://code.visualstudio.com/)

### Step 1: Verify Node.js Installation
Open a terminal and run:
```bash
node --version
npm --version
```

Both should show version numbers.

### Step 2: Install Dependencies
From the project root directory, run:
```bash
npm install
```

This installs all required packages:
- **Express** - HTTP server framework
- **Socket.IO** - Real-time bidirectional communication
- **Three.js** - 3D graphics library
- **Webpack** - Module bundler (for client code)

### Step 3: Build the Client
Package the client code for the browser:
```bash
npm run build
```

This creates `/dist/bundle.js` which contains all client code optimized for the browser.

### Step 4: Start the Server
```bash
npm start
```

You should see:
```
[timestamp] Server running on http://0.0.0.0:3000
[timestamp] Waiting for players to connect...
[timestamp] Starting game loop
```

---

## Architecture Overview

### System Design Philosophy

**Server-Authoritative Model:**
- The server is the single source of truth for all game state
- Server validates all player actions before applying them
- Clients predict locally and then reconcile with server
- This prevents cheating and keeps multiplayer synchronized

### Key Components

```
┌─────────────────────────────────────────────┐
│           BROWSER (Client)                  │
├─────────────────────────────────────────────┤
│ PlayerController → Scene → UI               │
│        ↓              ↓        ↓            │
│ Input Handling   3D Rendering  HUD/Minimap │
└──────────────────┬──────────────────────────┘
                   │ WebSocket
                   ↓
┌─────────────────────────────────────────────┐
│           NODE.JS (Server)                  │
├─────────────────────────────────────────────┤
│ Socket.IO Handler                           │
│        ↓                                     │
│ LobbyManager (create/join/manage lobbies)   │
│        ↓                                     │
│ GameState (players, monsters, orbs)         │
│        ↓                                     │
│ MonsterAI (monster behavior & spawning)     │
│        ↓                                     │
│ Game Loop (30 Hz updates)                   │
└─────────────────────────────────────────────┘
```

### Data Flow Example: Player Movement

1. **Client**: Player presses 'W'
2. **PlayerController**: Calculates new position locally
3. **Network**: Sends PLAYER_POSITION message to server (~30 times/sec)
4. **Server (GameState)**: Validates position is in bounds, updates player.position
5. **Server (Game Loop)**: Broadcasts new LOBBY_STATE to all players
6. **Client (Network)**: Receives LOBBY_STATE, updates render
7. **Client (Scene)**: Renders updated player position

---

## File Structure Explanation

### Root Level
```
package.json              - Project dependencies and npm scripts
webpack.config.js         - Build configuration for client code
```

### `/server` - Backend Server Code

**server/index.js** (Main server)
- Creates Express HTTP server
- Sets up Socket.IO WebSocket server
- Implements event handlers for all player actions
- Runs the main game loop (30 Hz)
- Serves static files from `/dist` for itch.io
- `GET /admin/stats` - Debug endpoint showing all lobbies and player counts

**server/config.js** (Configuration)
- Centralized server settings (PORT, DEBUG mode, etc.)
- Helper functions for logging and time tracking
- Easy to adjust for testing and deployment

**server/gameState.js** (Game State Manager)
- `GameState` class: maintains all data for one lobby
- Methods for adding/removing players
- Player health/score management
- Orb spawning and collection
- Blink cooldown tracking
- Attachment state machine (for back-to-back mechanics)
- Methods to query nearby players for broadcasts

**server/lobbyManager.js** (Lobby Management)
- `LobbyManager` class: manages multiple lobbies
- Create new lobbies
- Find available lobbies (matchmaking)
- Add/remove players
- Clean up empty lobbies
- Generates debug stats

**server/monsterAI.js** (Monster AI Logic)
- `MonsterAI` class: handles all monster behavior
- State machine: ROARING → IDLE → HUNTING → LOST
- **Blind spot calculation**: Spawns monsters behind players
- **Line of sight**: Simplified vision checks
- **Pathfinding**: Moves toward player targets
- **Attack logic**: Cooldowns and damage application
- **Spawning logic**: Increases monster count based on game time

### `/client` - Frontend Client Code (Browser)

**client/index.html** (Main Page)
- HTML structure with canvas for 3D rendering
- Styling for HUD and minimap
- Loading screen while connecting
- Messages area for broadcasts

**client/main.js** (Game Bootstrap)
- Entry point for the client
- Initializes all systems in order:
  1. UI system
  2. 3D Scene
  3. Network connection
  4. Player controller
- Sets up event listeners for network messages
- Runs game loop at 60 FPS using `requestAnimationFrame`

**client/network.js** (Networking)
- `NetworkManager` class: handles Socket.IO communication
- Connects to server via WebSocket
- Sends player updates (rate-limited to 30 Hz)
- Sends action messages (blink, collect orb, attach requests)
- Receives and routes server messages to appropriate handlers
- Automatic reconnection on disconnect

**client/scene.js** (3D Graphics)
- `Scene` class: Three.js scene management
- Initializes WebGL renderer, camera, and lighting
- Creates coliseum arena:
  - Circular floor
  - Outer walls
  - Random obstacles for cover
- Creates/updates meshes for:
  - Players (blue capsules)
  - Monsters (red icosahedrons with glow)
  - Orbs (yellow spinning spheres)
- Handles window resizing
- Smooth rendering at monitor refresh rate

**client/playerController.js** (Input & Movement)
- `PlayerController` class: local player control
- **Input mapping**:
  - WASD: Movement (forward slower, backward slowest, strafe medium)
  - Mouse: Camera look (pitch/yaw)
  - R: Blink
  - V: Attach/Accept
  - X: Decline/Cancel
  - U (double-press): Detach
  - I: Broadcast blink timer
  - O: Signal orb
  - P: Signal monster
  - N: Request control
- Client-side prediction with server reconciliation
- Updates gaze vector for blind spot calculations
- Enforces arena boundary

**client/ui.js** (HUD & Minimap)
- `UI` class: all head-up display elements
- **HUD elements**:
  - Health bar (color changes based on HP)
  - Score display
  - Blink timer (0.1s precision)
  - Attachment status
- **Minimap** (200×200 pixel canvas):
  - Shows arena layout
  - Player position (green circle)
  - Nearby players (blue dots)
  - Monsters (red dots, first 10s after spawn)
  - Orbs (yellow dots)
  - Safe zone boundary (green circle)
  - Shrinking zone boundary (red circle)
- Message system for broadcasts with fade animation

### `/shared` - Shared Code (Used by Both Client & Server)

**shared/constants.js** (Game Constants)
- All tunable values in one place:
  - Movement speeds (forward/backward/strafe)
  - Blink cooldown duration
  - Orb values and ranges
  - Arena settings
  - Monster behavior (vision range, damage, spawn conditions)
  - Attachment mechanics
  - Network tick rate
- Message types enum
- Player/Monster/Attachment state enums

**shared/types.js** (Type Definitions)
- JSDoc type definitions for:
  - Player object structure
  - Orb object structure
  - Monster object structure
  - Lobby object structure
  - Network messages
- Helps understand data structure across codebase
- Can be extended to TypeScript if desired

### `/dist` - Build Output
- Created by `npm run build`
- `bundle.js` - Bundled and minified client code
- Ready to upload to itch.io
- Also served by Express server

---

## Running the Game Locally

### Option 1: Single Computer (Testing)

**Terminal 1 - Start the server:**
```bash
npm start
```

**Terminal 2 - Open game in browser:**
- Go to http://localhost:3000
- Should connect automatically
- See one player in lobby

### Option 2: Multiple Computers on LAN (Local Network)

**On Server Computer:**
```bash
npm start
```
Note the IP address (e.g., `192.168.1.100` or `10.0.0.5`)

**On Other Computers (replace with your IP):**
- Open browser to `http://192.168.1.100:3000`
- Each player connects to shared server

**Finding your IP:**
- **Mac/Linux**: `ifconfig` (look for `inet` under `en0` or `eth0`)
- **Windows**: `ipconfig` (look for IPv4 address)

### Option 3: Multiple Tabs (Simulation)

Open the same browser tab multiple times:
1. http://localhost:3000 - Player 1
2. http://localhost:3000 - Player 2 (new tab)
3. Each gets their own connection and player

### Debugging

Check server stats at:
```
http://localhost:3000/admin/stats
```

Check browser console for logs:
- Chrome/Firefox/Safari: Press F12 → Console tab
- Look for connection logs and game events

---

## Implementation Roadmap

### Phase 1: Core Infrastructure (Weeks 1-2)
**Goal**: Get basic movement, networking, and rendering working

1. ✅ Project setup and dependencies
2. ✅ Server listens for connections
3. ✅ Clients can join lobbies
4. ✅ Basic player mesh rendering
5. ✅ WASD movement (client-side)
6. ✅ Mouse look (client-side)
7. ✅ Position sync to server
8. ✅ Other players appear on screen

**Testing**: Can you see 2+ players moving around in 3D?

### Phase 2: Game Mechanics (Weeks 3-4)
**Goal**: Implement collectibles and basic blink system

1. ☐ Spawn orbs at random locations
2. ☐ Collect orbs when nearby
3. ☐ Update score on HUD
4. ☐ Implement blink cooldown tracking
5. ☐ Blink timer precision (0.1s)
6. ☐ Basic minimap rendering
7. ☐ Health system (starting at 100)

**Testing**: Can you collect orbs and see score increase?

### Phase 3: Monster AI (Weeks 5-6)
**Goal**: Implement monster spawning and basic AI

1. ☐ Implement MONSTER_STATES state machine
2. ☐ Monster spawning after 30 seconds
3. ☐ Monster roaring animation (3s immobilized)
4. ☐ Basic vision range checks
5. ☐ Monster movement toward player
6. ☐ Monster rendering on client
7. ☐ Line-of-sight raycasting (simplified)
8. ☐ Monster attack (damage player)

**Testing**: Monsters appear, move toward you, and attack?

### Phase 4: Blind Spot & Spawning (Week 7)
**Goal**: Monster spawns behind player (blind spot)

1. ☐ Calculate player gaze direction from camera
2. ☐ Implement blind spot cone calculation
3. ☐ Find spawn position in blind spot
4. ☐ Verify spawn position is inside arena
5. ☐ Test that monsters spawn behind you

**Math Note**: The blind spot is a cone behind the player. A point is in the blind spot if:
```
dot(monsterToPlayer, playerBackwardDirection) > cos(CONE_ANGLE)
```

### Phase 5: Player Attachment (Week 8)
**Goal**: Two players can attach back-to-back

1. ☐ Implement attachment state machine
2. ☐ V key sends attach request
3. ☐ Other player sees request popup
4. ☐ Accept (V) or decline (X)
5. ☐ Attached players move together
6. ☐ Score sharing (split 50/50)
7. ☐ Head turning (arrow keys) when not controlling
8. ☐ Control request (N key)
9. ☐ U double-press to detach

**Testing**: Two players can attach and move together?

### Phase 6: Broadcasting & Advanced Features (Week 9)
**Goal**: Players can communicate with nearby players

1. ☐ Area broadcasts (I key) for blink timer
2. ☐ Monster signal (P key) - alert nearby players
3. ☐ Orb signal (O key) - point to collectible
4. ☐ Messages fade after 3 seconds
5. ☐ Nearby player detection (40-unit radius)

**Testing**: See broadcast messages from other players?

### Phase 7: Arena Shrinking (Week 10)
**Goal**: Safe zone contracts over time

1. ☐ Implement arena shrink at T=120s
2. ☐ Shrink radius over time
3. ☐ Damage players outside safe zone (5 HP/sec)
4. ☐ Red zone indicator on minimap
5. ☐ Update arena boundary visual

**Testing**: Outer area deals damage?

### Phase 8: Polish & Publishing (Weeks 11-12)
**Goal**: Ready for itch.io

1. ☐ Audio system (monster roars, orb pickup sounds)
2. ☐ Particle effects (death, orb collection)
3. ☐ More detailed models/textures
4. ☐ Tutorial/help screen
5. ☐ Settings menu (graphics, audio, controls)
6. ☐ Build for web (`npm run build`)
7. ☐ Test on itch.io

---

## Key Concepts Explained

### 1. Server-Authoritative Networking

**Why it matters**: Prevents cheating and keeps multiplayer fair.

**How it works**:
```
Client: "I moved to position (10, 1, 50)"
Server: "Let me check... yes, that's valid"
Server (to all): "Player at (10, 1, 50)"
```

If a client tries to cheat:
```
Client: "I teleported to (200, 1, 200)" [Outside arena]
Server: "Nope, that's out of bounds. Correcting you back."
```

### 2. Client-Side Prediction

**Problem**: If you wait for server response (100ms latency), movement feels sluggish.

**Solution**: Move the player locally while also sending to server.

```javascript
// Local: Update immediately
this.position.x += moveSpeed * deltaTime;

// Network: Send to server
socket.emit(PLAYER_POSITION, this.position);

// If server corrects: Snap back or smoothly interpolate
```

### 3. Blind Spot Calculation

**Definition**: The cone-shaped area behind a player that they can't see.

**Math**:
```
Vector from player to monster = monsterPos - playerPos
Normalize this vector: toMonster_normalized

Player's backward direction = -player.gaze
(gaze points forward, so backward is opposite)

Dot product = dot(toMonster_normalized, backwardDirection)
If dot > cos(120°) ≈ 0.5, monster is in blind spot
```

**Why 120°?**: Creates a realistic cone behind player (~60° on each side from straight back)

### 4. State Machines

**Concept**: Objects have discrete states; transitions happen based on conditions.

**Monster Example**:
```
┌──────────┐
│ ROARING  │ (just spawned, 3s immobile)
└────┬─────┘
     │ (after 3s)
     ↓
┌──────────┐
│  IDLE    │ (patrolling, looking for players)
└────┬─────┘
     │ (player visible & in range)
     ↓
┌──────────┐
│ HUNTING  │ (chasing player)
└────┬─────┘
     │ (lost line of sight, > 50m away)
     ↓
┌──────────┐
│  LOST    │ (searching)
└──────────┘
     │ (after 10s or find player again)
     ↓ loop back or give up
```

### 5. Three.js Coordinate System

```
      Y (up)
      │
      │
Z (toward viewer) ─── X (right)
      
Example positions:
- (0, 0, 0): Origin
- (10, 0, 0): 10 units to the right
- (0, 5, 0): 5 units up
- (0, 0, -10): 10 units away from viewer
```

### 6. Gaze Direction Vector

**What it is**: A unit vector (length 1) pointing where the player is looking.

**How to calculate from rotation**:
```javascript
const cosX = Math.cos(rotation.x); // pitch (up/down)
const sinX = Math.sin(rotation.x);
const cosY = Math.cos(rotation.y); // yaw (left/right)
const sinY = Math.sin(rotation.y);

gaze.x = sinY * cosX;
gaze.y = sinX;
gaze.z = cosY * cosX;
```

**Why it matters**:
- Used for monster blind spot checks
- Used for "orb/monster signal" directional broadcasts
- Used for raycasting (future: hit detection)

### 7. Networking Latency & Interpolation

**Problem**: Server sends updates at 30 Hz, but screen refreshes at 60 Hz.

**Solution**: Interpolate between old and new positions.

```javascript
// Smoothly move from lastPos to newPos
const alpha = 0.15; // blend factor
position.x = lastPos.x + (newPos.x - lastPos.x) * alpha;
position.y = lastPos.y + (newPos.y - lastPos.y) * alpha;
position.z = lastPos.z + (newPos.z - lastPos.z) * alpha;
```

---

## Publishing to itch.io

### Step 1: Build for Web

```bash
npm run build
```

This creates optimized `/dist/bundle.js` and `/dist` folder.

### Step 2: Create itch.io Account

Go to https://itch.io and create a free account.

### Step 3: Create a New Project

1. Click "Create new project"
2. Name it "Blink Royale"
3. Set classification to "Games"
4. Leave kind as "HTML"

### Step 4: Upload Files

1. Create a `.zip` file containing:
   ```
   index.html (from client/)
   bundle.js  (from dist/)
   ```
2. Upload the ZIP to itch.io

### Step 5: Configure

In itch.io project settings:
- **Kind of Project**: HTML
- **Viewport**: 800×600 (or your preferred size)
- **Allow Fullscreen**: Yes

### Step 6: Add Instructions

Add this to the project description:

```
Multi-Lobby Blink Royale

A multiplayer 3D battle royale game in a shrinking coliseum arena.

Controls:
- WASD: Move
- Mouse: Look Around
- R: Blink (refresh cooldown)
- V: Attach/Accept
- X: Decline
- U (double-press): Detach
- I: Broadcast blink timer
- Left-click: Collect orbs
- O: Signal "Orb here"
- P: Signal "Monster here"

To play with friends:
1. Click "Play in browser"
2. Find their IP address (see Help section)
3. Share: http://<their-ip>:3000
4. They connect and you play together!
```

### Step 7: Publish

Click "Save" and your game is live!

**Note**: For online multiplayer, players need to be on your LAN or use a tunnel service like **ngrok**:
```bash
ngrok http 3000
```

Then share the ngrok URL with players.

---

## Optimization Tips

### Client Performance
- Use object pooling for particle effects
- Limit monster mesh updates to once per server tick
- Simplify geometry for obstacles
- Use camera fog to limit render distance

### Server Performance
- Use spatial partitioning (quadtree) for monster vision checks
- Cache nearby player lookups
- Limit broadcast radius to 40 units
- Profile with `--prof` flag

### Network Efficiency
- Only send position updates for moved entities
- Compress position data (quantize to integers)
- Use delta compression (send only changes)
- Implement LOD (level-of-detail) for distant players

---

## Common Issues & Fixes

### "Can't connect to server"
- Make sure `npm start` is running
- Check firewall isn't blocking port 3000
- Try localhost:3000 first before LAN IP

### "Movement is jerky"
- Server tick rate might be too low
- Increase `NETWORK_TICK_RATE` in constants.js
- Tradeoff: Higher = smoother but more network traffic

### "Monsters spawn on top of me"
- Blind spot calculation might be wrong
- Check `isPlayerInBlindSpot()` in monsterAI.js
- Verify dot product threshold is correct

### "Three.js errors about undefined"
- Make sure `npm run build` succeeded
- Check browser console (F12)
- Verify `bundle.js` is being loaded in Network tab

---

## Next Steps

1. **Run the server**: `npm start`
2. **Open browser**: http://localhost:3000
3. **See loading screen** while connecting
4. **Move around** with WASD
5. **Check console** (F12) for any errors
6. **Read the Implementation Roadmap** to pick your first task
7. **Start coding!**

Good luck building this amazing game! 🎮
