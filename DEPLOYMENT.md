# Multi-Lobby Blink Royale - Deployment Guide

Complete instructions for running the game locally and deploying to itch.io.

## Quick Start (Local Play)

### Prerequisites
- Node.js 16+ ([download](https://nodejs.org))
- npm (comes with Node.js)
- A modern web browser (Chrome, Firefox, Safari, Edge)

### Installation & Running

```bash
# 1. Install dependencies
npm install

# 2. Start the server
npm start

# 3. Open browser to http://localhost:3000
# (or your computer's IP for LAN play)
```

The game will:
- Start server on `0.0.0.0:3000` (accessible from any device on your network)
- Load index.html in your browser
- Create lobbies automatically as players join

## Server Configuration

Edit [server/config.js](server/config.js) to customize:

| Parameter | Default | Purpose |
|-----------|---------|---------|
| `ARENA_RADIUS` | 100 | Starting arena size |
| `PLAYER_MAX_HEALTH` | 100 | Player health points |
| `PLAYER_BLINK_MAX_TIME` | 20 | Seconds before forced blink |
| `MONSTER_SPAWN_DELAY` | 30 | Match start delay (seconds) |
| `GAME_DURATION` | 180 | Max match length (seconds) |

See [server/config.js](server/config.js) for all 40+ tunable parameters.

## Networking

### Local Network Play
1. Find your computer's IP: `ipconfig` (Windows) or `ifconfig` (Mac/Linux)
2. Give other players: `http://YOUR_IP:3000`
3. Port-forward 3000 on your router (see below)

### Internet Play (WAN)
1. **Port Forward on Router:**
   - Forward port 3000 to your machine's local IP
   - Instructions vary by router—search "[YOUR_ROUTER] port forwarding"

2. **Find Your Public IP:**
   - Visit [whatismyipaddress.com](https://www.whatismyipaddress.com)
   - Give players: `http://YOUR_PUBLIC_IP:3000`

3. **Firewall:**
   - Allow Node.js through Windows Firewall (if using Windows)

## Deploying to Itch.io

### Uploading

1. **Create Itch.io Account** (free at [itch.io](https://itch.io))

2. **Create a New Project**
   - Click "New Project" > "Game"
   - Game title: "Multi-Lobby Blink Royale"
   - Game link: Choose a slug (e.g., `blink-royale`)

3. **Upload Client**
   - Download `client/index.html` from the repository
   - In Itch.io project settings:
     - Upload `index.html`
     - Set as "HTML"
     - Check "This file will be played in the browser"

4. **Setup Server Connection**
   - Players will be unable to connect to your computer directly via itch.io
   - Instead, run your server on a **VPS or cloud server** (see options below)

### Running Server on Cloud

**Option A: Heroku (Free tier available)**
```bash
# 1. Install Heroku CLI
# 2. Login: heroku login
# 3. Create app: heroku create blink-royale-server
# 4. Deploy: git push heroku main
# 5. Update itch.io page with: https://blink-royale-server.herokuapp.com
```

**Option B: Replit (Free tier with limits)**
- Upload to Replit
- Get public URL
- Update itch.io with that URL

**Option C: AWS/Azure/Digital Ocean (Paid)**
- More reliable for production
- Full control over resources
- Recommend t2.micro tier ($5-10/month)

### Updating Client Connection

In [client/index.html](client/index.html), the `NetworkManager` auto-detects the server:
- Local: `ws://localhost:3000`
- Current domain: `ws://currenthost:3000`

To override, edit [client/network.js](client/network.js):
```javascript
const serverUrl = 'wss://your-server.com'; // Use wss:// for HTTPS
```

## Controls Reference

| Key | Action |
|-----|--------|
| **WASD** / **Arrows** | Move (S is 50% speed) |
| **Mouse** | Look around (click to lock) |
| **R** | Blink (20s timer, +10s per voluntary blink) |
| **V** | Request/accept attachment |
| **X** | Decline/cancel attachment |
| **U+U** | Double-press to detach |
| **I** | Broadcast blink timer to nearby players |
| **O** | Broadcast orb location ahead |
| **P** | Broadcast monster location ahead |
| **N** | Request control swap (if attached) |

## Gameplay Mechanics

### Blink Mechanic
- Forced blink every **20 seconds** of staring
- Voluntary blink adds **+10 seconds** to timer
- During blink, you **cannot see or be seen** (0.5s blackout)
- Look away to avoid the timer!

### Monsters
- Spawn after **30 seconds** match start
- Then **1 per living player per minute**
- **Freeze when looked at directly** (blind spot detection)
- Attack deals **60% of max health damage**
- Health: **50 HP** each

### Attachment (Pairing)
- Request via **V key** (nearest player)
- Accept/decline with **V/X**
- Attached players:
  - Share vision (both can look)
  - Move together
  - Both must blink together
  - Either can **U+U to detach**

### Arena Shrinking
- Match duration: **3 minutes**
- Shrinking starts at **2-minute mark**
- Shrinks from **radius 100 → 10** in **1 minute**
- Outside safe zone: **60% health damage/second**

### Victory Conditions
- Last player(s) alive win
- Automatic match end after 3 minutes
- Leaderboard shows all survivors

## Troubleshooting

### Can't connect to server
- ✅ Server running? Check terminal: `npm start`
- ✅ Correct URL? Should be `http://localhost:3000`
- ✅ Port 3000 free? Try: `npm run server` then check error

### Game freezes/lags
- ✅ Network lag? Check server latency (admin panel at `/admin/stats`)
- ✅ Too many players? Move some to different lobby
- ✅ Browser performance? Switch to Chrome/Firefox

### Can't see other players
- ✅ In same lobby? Check lobby code in top-left
- ✅ Wait 5 seconds for match to auto-start
- ✅ Try refreshing browser (F5)

### Port already in use
```bash
# Kill process on port 3000
# Linux/Mac:
lsof -ti:3000 | xargs kill -9

# Windows:
netstat -ano | findstr :3000
taskkill /PID <PID> /F
```

## Architecture Overview

```
                      Browser
                         │
          ┌──────────────┴──────────────┐
          │                             │
       index.html                   Socket.IO Client
          │                             │
    ┌─────┴─────────────────────────────┴──────┐
    │                                           │
 Canvas 3D Scene                            Network Layer
  (Three.js)                                     │
    │                                           │
    ├─ Players (blue/green capsules)            │
    ├─ Monsters (red icospheres)                │
    ├─ Orbs (yellow spinning spheres)           │
    ├─ Arena (circular ground + walls)          │
    └─ Minimap (2D top-down view)               │
                                                │
                                     ┌──────────┴──────────┐
                                     │                     │
                                    Node.js             Lobbies
                                     │
                            ┌────────┼─────────┐
                            │        │         │
                        Config  GameState  Monsters
                            │        │         │
                            └────────┼─────────┘
                                     │
                            Game Loop (60Hz updates)
                            Broadcast (30Hz network)
```

## Admin Console

Access at `http://localhost:3000/admin/stats`:
- View all active lobbies
- Player counts per lobby
- Match duration and scores
- Server uptime and memory usage

## Development Commands

```bash
npm start          # Production mode
npm run dev        # Development (with debug logs)
npm run server     # Just server, no browser
```

## Performance Tips

1. **Reduce player count per lobby** if experiencing lag
   - Default: 8 max per lobby
   - Edit in [server/config.js](server/config.js): `LOBBY_MAX_PLAYERS`

2. **Adjust network broadcast rate**
   - Higher = more responsive but more bandwidth
   - Lower = less bandwidth but more latency
   - Edit: `GAME_UPDATE_BROADCAST_RATE` in [server/config.js](server/config.js)

3. **Graphics settings** (in browser)
   - Disable shadows: Edit [client/scene.js](client/scene.js)
   - Reduce viewport size (zoom out in browser)

## Reporting Issues

If you find bugs:
1. Check browser console (F12 → Console)
2. Check server terminal output
3. Visit `/admin/stats` for server state
4. Create issue on GitHub with:
   - Error message
   - Steps to reproduce
   - Browser version

---

**Enjoy! 🎮**

For more info on game design, see [ARCHITECTURE_DIAGRAMS.md](ARCHITECTURE_DIAGRAMS.md) and [IMPLEMENTATION_CHECKLIST.md](IMPLEMENTATION_CHECKLIST.md).
