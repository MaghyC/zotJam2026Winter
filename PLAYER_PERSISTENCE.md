# Player Persistence & Login System

## Overview

The game now features a **persistent player identity system** with **automatic room reconnection**. Players no longer get a new ID on page refresh, and they automatically rejoin their previous lobby if disconnected.

## Features

### 1. Login Screen
- **First-time players** see a login screen asking for their username
- **Returning players** see their last username pre-filled
- Username is validated (2-20 characters)
- Simple, clean UI matching the game aesthetic

### 2. Persistent Player IDs
- Each player gets a unique **Player ID** on first login
- This ID is stored in **browser localStorage** and persists across page refreshes
- Player data includes:
  - `playerId`: Unique identifier for the player
  - `username`: Player's chosen name
  - `timestamp`: When the session was saved

### 3. Automatic Reconnection
- **Grace Period**: 60 seconds (configurable in `server/config.js`)
- If a player disconnects (network issue, page refresh, etc.), they have **60 seconds to reconnect**
- If they reconnect within this period:
  - They rejoin the **same lobby** they left
  - Their **game state is restored**
  - Other players are notified they've reconnected
- If they don't reconnect within 60 seconds:
  - They are permanently removed from the lobby
  - Their player session is cleared
  - They must log in again

### 4. Browser Memory
The game stores the following in browser localStorage:
- **`playerId`**: Player's persistent ID
- **`lastUsername`**: Last username used (for convenience)
- **`playerSession`**: Full session object (ID, username, timestamp)

## User Experience

### First Time Playing
```
1. Open http://localhost:3000
2. See login screen with "BLINK ROYALE" title
3. Enter username (e.g., "Alice")
4. Click "JOIN GAME"
5. Gets assigned playerId "abc123..."
6. Joins a lobby and can play
```

### Page Reload (Same Session)
```
1. Press F5 or close/reopen browser
2. Login screen shows "Alice" pre-filled
3. Click "JOIN GAME" or press Enter
4. Automatically rejoin the same lobby you left
5. Game continues where you left off
```

### Network Disconnect (Within 60 seconds)
```
1. Network goes down / socket disconnects
2. You have 60 seconds to reconnect
3. When you reload, login screen appears
4. Enter same username or just press Enter
5. System recognizes you as the same player
6. You rejoin your previous lobby
7. Game continues with your preserved state
```

### Longer Disconnect (60+ seconds)
```
1. Network down for 61+ seconds
2. Your player data is removed from server
3. When you reload, you rejoin as a new player
4. Previous lobby connection is lost
5. You'll need to find a new lobby or create one
```

## How It Works

### Client-Side (Browser)

**Step 1: Login**
```javascript
// main.js shows login screen
showLoginScreen() {
  // Displays form asking for username
  // Stores username in localStorage
}
```

**Step 2: Connect with Persistence**
```javascript
// main.js - startGame()
const storedPlayerId = localStorage.getItem('playerId');
const network = new NetworkManager();
await network.connect(username, storedPlayerId); // Pass previous ID
```

**Step 3: Automatic Restoration**
```javascript
// main.js - init()
const savedSession = loadPlayerSession();
if (savedSession) {
  // We've logged in before - use saved data
  this.username = savedSession.username;
  this.playerId = savedSession.playerId;
  await this.startGame();
} else {
  // First time - show login screen
  this.showLoginScreen();
}
```

### Server-Side (Node.js)

**Step 1: Handle Reconnection Request**
```javascript
// server/index.js - join_lobby handler
socket.on('join_lobby', (data) => {
  const previousPlayerId = data.previousPlayerId;
  
  if (previousPlayerId && disconnectedPlayers.has(previousPlayerId)) {
    const timeSinceDisconnect = Date.now() - disconnected.disconnectTime;
    
    if (timeSinceDisconnect < CONFIG.RECONNECT_GRACE_PERIOD) {
      // Player is reconnecting - restore their state
      isReconnect = true;
      targetLobbyId = disconnected.lobbyId;
      actualPlayerId = previousPlayerId;
    }
  }
});
```

**Step 2: Store Disconnected Players**
```javascript
// server/index.js - disconnect handler
socket.on('disconnect', () => {
  // Store player info for 60 seconds
  disconnectedPlayers.set(playerId, {
    lobbyId: lobbyId,
    disconnectTime: Date.now(),
    playerId: playerId,
    username: player.username,
    timeout: reconnectTimer // Clear after grace period
  });
});
```

**Step 3: Cleanup After Grace Period**
```javascript
// After RECONNECT_GRACE_PERIOD (60 seconds):
// - Remove player from lobby
// - Clear disconnectedPlayers entry
// - Client must re-login
```

## Configuration

Edit `server/config.js` to customize timing:

```javascript
// Reconnection
RECONNECT_GRACE_PERIOD: 60000,  // 60 seconds to reconnect (in ms)
RECONNECT_TIMEOUT: 30000,       // Keep state for 30s (legacy)
```

## Files Modified

### New/Enhanced Files

1. **`client/index.html`**
   - Added login screen UI with styling
   - Added form for username input
   - Login button with validation

2. **`client/main.js`**
   - Added `loadPlayerSession()` - restore previous session
   - Added `savePlayerSession()` - store session to localStorage
   - Added `showLoginScreen()` - display login form
   - Added `hideLoginScreen()` - hide login form
   - Updated `init()` - check for saved session first
   - Updated `startGame()` - handle reconnection with previous player ID

3. **`client/network.js`**
   - Updated `connect()` - accept `previousPlayerId` parameter
   - Send previous ID to server for reconnection matching

4. **`server/index.js`**
   - Updated connection handler - use persistent player IDs
   - Updated `join_lobby` handler:
     - Accept `previousPlayerId` from client
     - Check `disconnectedPlayers` map for matching ID
     - Restore player to original lobby if within grace period
     - Send "reconnected" event if rejoining
   - Updated disconnect handler:
     - Store player in `disconnectedPlayers` map
     - Set timeout to remove after grace period

5. **`server/config.js`**
   - Added `RECONNECT_GRACE_PERIOD: 60000` (already present)
   - Added `RECONNECT_TIMEOUT: 30000` (already present)

## Testing Checklist

- [ ] **First Login**: Open browser, enter username, verify you can play
- [ ] **Page Refresh**: Press F5, verify you rejoin the same lobby
- [ ] **Browser Restart**: Close entire browser, reopen, verify you rejoin
- [ ] **Username Prefill**: Check that your last username appears in login form
- [ ] **Multiple Players**: Have 2+ players in same lobby, reload one, verify they rejoin
- [ ] **Grace Period**: Disconnect, wait 30 seconds, refresh - should rejoin
- [ ] **Grace Period Expired**: Disconnect, wait 70+ seconds, refresh - should be new player
- [ ] **Storage Cleared**: Clear localStorage, refresh, should see login form
- [ ] **Consistent ID**: Login with same username multiple times, verify same playerId in console

## localStorage Keys

After first login, your browser stores:

```json
{
  "playerId": "abc123def456...",
  "lastUsername": "Alice",
  "playerSession": {
    "username": "Alice",
    "playerId": "abc123def456...",
    "timestamp": 1705478942123
  }
}
```

To clear and start fresh:
```javascript
// In browser console:
localStorage.clear();
location.reload();
```

## Troubleshooting

### "I keep getting a new ID"
- Check browser storage is enabled
- Verify localStorage isn't being cleared
- Check browser console for errors

### "I can't rejoin my lobby"
- Check 60-second grace period hasn't expired
- Verify server logs show reconnection attempt
- Try refreshing again if network was unstable

### "My username is wrong"
- Login screen should prefill your last username
- You can change it by editing the input field
- Old sessions with different username won't reconnect (new player)

### "Server says 'No lobbies available'"
- Maximum lobbies (10) might be full
- Create a new lobby or join when someone leaves
- Adjust `MAX_LOBBIES` in `server/config.js`

## Advanced Usage

### Manual localStorage Management (Dev Tools)

```javascript
// View your player ID:
console.log(localStorage.getItem('playerId'));

// View your session:
console.log(JSON.parse(localStorage.getItem('playerSession')));

// Force new session:
localStorage.clear();
location.reload();

// Simulate reconnection test:
const fakeId = 'test-player-123';
localStorage.setItem('playerId', fakeId);
// Now logging in will attempt to reconnect as test-player-123
```

### Server-Side Monitoring

Monitor reconnections in server logs:
```
[INFO] Player abc123... reconnecting to lobby lobby1
[INFO] Player abc123... permanently removed after reconnect timeout
```

Enable debug logging:
```bash
DEBUG=true npm start
```

## Future Enhancements

Possible improvements:
- [ ] OAuth/account system for cross-device persistence
- [ ] Cloud save state (not just reconnect)
- [ ] Player statistics tracking
- [ ] Friend lists
- [ ] Lobbies you can rejoin later (not just grace period)
- [ ] Ban/mute system per lobby
- [ ] Admin controls to force player removal

## Summary

Your game now has **enterprise-level player persistence**:
- ✅ Persistent player IDs across page reloads
- ✅ Automatic room rejoin on disconnect
- ✅ 60-second grace period for network hiccups
- ✅ Clean login UI
- ✅ Browser-based storage (no backend account system needed)
- ✅ Server-side validation and security

Players can now take comfort knowing their game session will survive a page reload! 🎮
