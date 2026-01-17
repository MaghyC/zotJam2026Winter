# Quick Start Guide

Get the game running in 3 commands.

## Installation

```bash
# Install dependencies
npm install

# Start the server (runs on http://localhost:3000)
npm start

# Open in browser
# Go to: http://localhost:3000
```

## Play with Friends (LAN)

1. Find your IP: `ipconfig` (Windows) or `ifconfig` (Mac/Linux)
2. Share: `http://YOUR_IP:3000`
3. All devices on same WiFi can join

## Customize (Optional)

Edit [server/config.js](server/config.js) to change:
- Arena size
- Player health
- Monster damage
- Blink timer
- All 40+ game parameters

## Deploy to Web

For multiplayer over the internet, you'll need to:
1. Host server on a VPS (Heroku, AWS, DigitalOcean)
2. Update client to connect to server URL
3. Upload `index.html` to itch.io

See [DEPLOYMENT.md](DEPLOYMENT.md) for full instructions.

---

**Controls:**
- WASD/Arrows: Move
- Mouse: Look (click to lock)
- R: Blink
- V/X: Attachment
- U+U: Detach
- I: Broadcast timer
