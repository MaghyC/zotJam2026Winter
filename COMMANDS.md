# Command Reference Guide

Quick reference for all commands and configuration options.

## Running the Game

### Start Server (Production)
```bash
npm start
```
- Runs `node server/index.js`
- Server listens on `ws://0.0.0.0:3000`
- Open browser to `http://localhost:3000`

### Start Server (Development)
```bash
npm run dev
```
- Same as production but with `DEBUG=true`
- More verbose logging output

### Start Server (Alternative)
```bash
npm run server
```
- Same as `npm start`

---

## Testing Commands

### Check Syntax
```bash
node -c server/index.js
node -c shared/types.js
```

### Run All Tests
```bash
npm test
```
- Currently outputs: "Tests not implemented yet"
- Future: add Jest/Mocha tests

### Check Dependencies
```bash
npm list
npm list --depth=0
```

### Audit Security
```bash
npm audit
```
- Current: 0 vulnerabilities
- Only 2 dependencies (express, socket.io)

---

## Configuration

### Game Settings

Edit [server/config.js](server/config.js):

```javascript
const CONFIG = {
  // Arena
  ARENA_RADIUS: 100,                    // Starting size
  ARENA_HEIGHT: 150,                    // Wall height
  ARENA_SHRINK_START_TIME: 120000,      // 2 minutes in ms
  ARENA_SHRINK_DURATION: 60000,         // 1 minute in ms
  ARENA_FINAL_RADIUS: 10,               // Final shrunk size

  // Player
  PLAYER_MAX_HEALTH: 100,               // Starting health
  PLAYER_REGEN_AMOUNT: 1,               // HP per regen
  PLAYER_REGEN_INTERVAL: 5000,          // Regen every 5s
  PLAYER_SPEED: 25,                     // Units/second forward
  PLAYER_BACKWARD_SPEED_MULTIPLIER: 0.5, // 50% speed backward

  // Blink
  PLAYER_BLINK_MAX_TIME: 20000,         // 20 seconds in ms
  PLAYER_BLINK_ADD_VOLUNTARY: 10000,    // +10 seconds voluntary
  PLAYER_BLINK_BLACKOUT_DURATION: 500,  // 0.5s can't see

  // Monster
  MONSTER_MAX_HEALTH: 50,               // Monster health
  MONSTER_SPEED: 20,                    // Units/second
  MONSTER_ATTACK_COOLDOWN: 2000,        // 2s between attacks
  MONSTER_ATTACK_DAMAGE_PERCENT: 0.6,   // 60% of player max health
  MONSTER_DETECTION_RANGE: 30,          // 30 units detection
  MONSTER_DETECTION_CONE_ANGLE: 0.6,    // ~70 degrees vision
  MONSTER_BLIND_SPOT_ANGLE: 0.2,        // ~22 degrees blind spot

  // Game
  GAME_UPDATE_TICK_RATE: 60,            // Server ticks/second
  GAME_UPDATE_BROADCAST_RATE: 30,       // Network updates/second
  GAME_DURATION: 180000,                // 3 minute matches
  
  // Lobby
  LOBBY_MAX_PLAYERS: 8,                 // Max per lobby
  LOBBY_AUTO_START_DELAY: 5000,         // Auto-start after 5s
  LOBBY_AUTO_START_MIN_PLAYERS: 2,      // Or with 2+ players
};
```

---

## Server Endpoints

### Web Interface
```
http://localhost:3000
```
- Serves index.html
- WebSocket connection for gameplay

### Admin Statistics
```
http://localhost:3000/admin/stats
```
JSON response:
```json
{
  "serverUptime": 123456,
  "totalLobbies": 5,
  "totalPlayers": 12,
  "memoryUsage": "52.3 MB",
  "lobbies": [...]
}
```

### Admin Lobbies Detail
```
http://localhost:3000/admin/lobbies
```
JSON response:
```json
[
  {
    "code": "AB12",
    "playerCount": 8,
    "status": "running",
    "matchTime": 45000,
    "players": [...]
  },
  ...
]
```

---

## Network Events

### Client → Server Events

**join_lobby**
```javascript
{ username: "PlayerName" }
```
Response: `join_lobby_response`

**player_input**
```javascript
{
  position: { x: 0, y: 1.8, z: 0 },
  rotation: { x: 0.1, y: 1.5, z: 0 },
  gaze: { x: 0.7, y: 0, z: 0.7 }
}
```

**blink_action**
```javascript
{}
```
Response: `blink_response`

**collect_orb**
```javascript
{ orbId: "orb123" }
```

**attach_request**
```javascript
{ targetPlayerId: "player456" }
```

**attach_response**
```javascript
{
  fromPlayerId: "player456",
  accepted: true
}
```

**detach**
```javascript
{}
```

**broadcast_timer**
```javascript
{ cooldownRemaining: 15.3 }
```

### Server → Client Events

**state_update**
```javascript
{
  players: [...],
  monsters: [...],
  orbs: [...],
  arenaSafeRadius: 95.5
}
```

**match_end**
```javascript
{
  results: [
    { rank: 1, playerId: "p1", username: "Winner", score: 150 },
    { rank: 2, playerId: "p2", username: "Second", score: 120 },
    ...
  ]
}
```

---

## Game Constants

### In Shared Types
```javascript
// shared/types.js
GAME_CONSTANTS = {
  ARENA_RADIUS: 100,
  PLAYER_MAX_HEALTH: 100,
  PLAYER_BLINK_MAX_TIME: 20000,
  MONSTER_MAX_HEALTH: 50,
  // ... 50+ more constants
};
```

### State Enums

**PLAYER_STATES**
- `ALIVE` - Playing
- `DEAD` - Eliminated
- `SPECTATING` - Watching after death

**MONSTER_STATES**
- `ROARING` - Just spawned, immobile
- `IDLE` - Wandering
- `HUNTING` - Chasing player
- `ATTACKING` - In melee range
- `DEAD` - Killed

**ATTACHMENT_STATES**
- `ALONE` - Solo
- `REQUEST_SENT` - Waiting for response
- `REQUEST_RECEIVED` - Pending decision
- `ATTACHED` - Paired with partner

---

## Environment Variables

### Development Mode
```bash
NODE_ENV=development DEBUG=true npm start
```

### Logging Levels
In [server/config.js](server/config.js):
```javascript
logger.debug('Detailed info');     // Only in DEBUG mode
logger.info('Important event');    // Always logged
logger.warn('Warning message');    // Always logged
logger.error('Error occurred');    // Always logged + stderr
```

---

## Troubleshooting Commands

### Port Already In Use
```bash
# Linux/Mac: Kill process on port 3000
lsof -ti:3000 | xargs kill -9

# Windows: Find and kill process
netstat -ano | findstr :3000
taskkill /PID <PID> /F
```

### Clear Node Modules
```bash
rm -rf node_modules package-lock.json
npm install
```

### Check Node Version
```bash
node --version  # Should be 16+
npm --version   # Should be 7+
```

### Test Server Locally
```bash
curl http://localhost:3000
```

---

## Performance Tuning

### Reduce Network Bandwidth
In [server/config.js](server/config.js):
```javascript
GAME_UPDATE_BROADCAST_RATE: 20,  // Reduce from 30 to 20 Hz
```

### Increase Server Ticks (More Responsive)
```javascript
GAME_UPDATE_TICK_RATE: 120,  // Increase from 60 to 120 Hz
```

### Lower Monster Spawn Rate
```javascript
MONSTER_SPAWN_DELAY: 60,  // Delay 60s before first spawn
MONSTER_SPAWN_RATE: 2,    // 1 monster per 2 living players instead of 1 per 1
```

### Faster Arena Shrinking
```javascript
ARENA_SHRINK_START_TIME: 60000,   // Start at 1 minute instead of 2
ARENA_SHRINK_DURATION: 30000,     // Shrink in 30s instead of 60s
```

### Increase Player Health
```javascript
PLAYER_MAX_HEALTH: 150,  // More forgiving gameplay
```

---

## Monitoring

### Check Server Status
```bash
curl http://localhost:3000/admin/stats
```

### Check Active Lobbies
```bash
curl http://localhost:3000/admin/lobbies
```

### Monitor Logs
```bash
npm start 2>&1 | tee server.log
```

### Live Debug
```bash
DEBUG=true npm run dev
# More verbose output
```

---

## Deployment

### Local
```bash
npm install
npm start
# http://localhost:3000
```

### LAN
```bash
npm start
# Share: http://YOUR_IP:3000
# Friends on same WiFi can join
```

### Internet (With Port Forwarding)
```bash
npm start
# Share: http://YOUR_PUBLIC_IP:3000
# Requires port forwarding 3000 on router
```

### Cloud (Heroku Example)
```bash
heroku login
heroku create blink-royale
git push heroku main
# Server: https://blink-royale.herokuapp.com
```

---

## File Modifications

### Change Game Title
In [client/index.html](client/index.html):
```html
<title>Multi-Lobby Blink Royale</title>
```

### Change Theme Colors
In [client/index.html](client/index.html):
```css
:root {
  --primary: #00ff00;      /* Green */
  --secondary: #ffff00;    /* Yellow */
  --accent: #ff00ff;       /* Magenta */
}
```

### Change Server Port
In [server/config.js](server/config.js) (would need to add):
```javascript
const PORT = process.env.PORT || 3000;
```
Then in [server/index.js](server/index.js):
```javascript
server.listen(PORT, '0.0.0.0', () => {
  // ...
});
```

---

## Debug Output

### Server Debug Logs
```
[2026-01-17T03:43:57.354Z] [DEBUG] Game tick 1234
[2026-01-17T03:43:57.355Z] [INFO] Player 'Alice' joined lobby 'AB12'
[2026-01-17T03:43:58.200Z] [WARN] Monster 1 spawned at (10, 0, 20)
[2026-01-17T03:43:59.100Z] [ERROR] Player 'Bob' disconnected
```

### Client Console
```javascript
// In browser console (F12)
window.gameClient          // GameClient instance
window.gameScene           // GameScene (Three.js)
window.GAME_TYPES          // Type definitions
```

---

## Quick Reference Summary

| Command | Purpose |
|---------|---------|
| `npm start` | Run production server |
| `npm run dev` | Run with debug logging |
| `npm run server` | Alias for start |
| `node -c server/index.js` | Check syntax |
| `npm list` | List dependencies |
| `npm audit` | Check vulnerabilities |
| `curl :3000/admin/stats` | Server statistics |
| `curl :3000/admin/lobbies` | Active lobbies |

---

**For more info, see:**
- [QUICKSTART.md](QUICKSTART.md) - 3-command setup
- [DEPLOYMENT.md](DEPLOYMENT.md) - Full deployment guide
- [README.md](README.md) - Project overview
