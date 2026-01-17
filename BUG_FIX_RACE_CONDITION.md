# Bug Fix #2 - "Connecting to Server" Screen Hung

## Problem
After fixing the first issue, the client still showed "Connecting to server..." indefinitely and never loaded the game.

## Root Cause - Race Condition

The issue was a **race condition** between asynchronous events:

```javascript
// OLD (Broken) Flow:

// 1. Connect to server
await this.network.connect(this.username, this.playerId);
// ↓ Promise resolves when join_lobby_response is received
// ↓ Inside network.js, this also fires _fireCallback('joined_lobby', data)

// 2. Setup network callbacks
this.setupNetworkCallbacks();  // ← TOO LATE!

// 3. Wait for joined_lobby event
await new Promise((resolve) => {
  const onJoined = (data) => { ... };
  this.network.on('joined_lobby', onJoined);  // ← Event already fired!
});
```

**Timeline:**
```
T=0ms:    connect() called
T=100ms:  Server sends join_lobby_response
T=105ms:  Client receives response
T=106ms:  'joined_lobby' callback FIRED
T=107ms:  setupNetworkCallbacks() runs (too late!)
T=108ms:  Listener for 'joined_lobby' set up
          ↑ But event already fired at T=106ms!
          → Event missed!
          → Promise never resolves
          → Game never loads ✗
```

## Solution

Instead of waiting for a separate event that might have already fired, use the data returned from `connect()` directly:

```javascript
// NEW (Fixed) Flow:

// 1. Setup network callbacks FIRST
this.setupNetworkCallbacks();

// 2. Connect to server and capture the returned data
const joinData = await this.network.connect(this.username, this.playerId);
// ↓ This resolves when join_lobby_response is received
// ↓ We capture the data directly

// 3. Use the data we already have
this.onLobbyJoined(joinData);
// ↓ Game initializes immediately
// ↓ No waiting for missed events!
```

**Timeline:**
```
T=0ms:    setupNetworkCallbacks() runs
T=1ms:    connect() called
T=100ms:  Server sends join_lobby_response
T=105ms:  Client receives response
T=106ms:  connect() promise RESOLVES with data
T=107ms:  onLobbyJoined(joinData) called
T=108ms:  Game scene initializes ✓
T=200ms:  Game fully loaded and playing ✓
```

## Code Change

**File:** `client/main.js` (Lines 165-182)

**Before:**
```javascript
await this.network.connect(this.username, this.playerId);

this.playerId = this.network.playerId;
localStorage.setItem('playerId', this.playerId);
this.savePlayerSession();

console.log('[Main] Connected with ID:', this.playerId);

this.setupNetworkCallbacks();

// Wait for join response (Event might already be fired!)
await new Promise((resolve) => {
  const onJoined = (data) => {
    this.network.off('joined_lobby', onJoined);
    this.onLobbyJoined(data);
    resolve();
  };
  this.network.on('joined_lobby', onJoined);
});
```

**After:**
```javascript
// Setup callbacks FIRST
this.setupNetworkCallbacks();

// Connect and capture data directly
const joinData = await this.network.connect(this.username, this.playerId);

// Store the received player ID
this.playerId = this.network.playerId;
localStorage.setItem('playerId', this.playerId);
this.savePlayerSession();

console.log('[Main] Connected with ID:', this.playerId);

// Use the data we already have
this.onLobbyJoined(joinData);
```

## Why This Works

1. **setupNetworkCallbacks() runs first** - All event listeners are ready
2. **connect() returns a promise** - This promise resolves with the join data
3. **We capture the data directly** - No waiting for a callback event
4. **onLobbyJoined() is called immediately** - Game initializes right away
5. **No race condition** - The data is returned, not missed via callback

## What Was Happening

The `network.js` `join_lobby_response` handler does this:
```javascript
this.socket.on('join_lobby_response', (data) => {
  if (data.success) {
    this.playerId = data.playerId;
    this.lobbyCode = data.lobbyCode;
    this.isReady = true;
    this._fireCallback('joined_lobby', data);  // ← Fires callback
    resolve(data);                             // ← Resolves promise
  }
});
```

The callback `_fireCallback('joined_lobby')` was being called, but the listener in `startGame()` wasn't set up yet, so the event was missed. By using the promise's `resolve(data)` return value instead, we guarantee the data is delivered.

## Testing

### Test 1: First Login
1. Open http://localhost:3000
2. See login screen
3. Type username and click "JOIN GAME"
4. **Result**: Loading screen briefly, then GAME LOADS ✓

### Test 2: Game Running
1. See 3D arena
2. Can move with WASD
3. Can look with mouse
4. HUD shows health, blink timer, etc.
5. **Result**: FULLY PLAYABLE ✓

### Test 3: Multiple Players
1. Open 2+ browsers
2. Both login and see same lobby
3. **Result**: Both players in same game ✓

### Test 4: Reconnection
1. Press F5 to refresh
2. See loading screen
3. Game continues
4. **Result**: Reconnected to same lobby ✓

## Verification

✅ **Syntax**: `node -c client/main.js` passes
✅ **Server**: Running and accepting connections
✅ **Game Launch**: Players can now see the game
✅ **Multiplayer**: Multiple players can join

## Related Code

The fix depends on:
- **`network.js`**: `connect()` promise resolves with join data ✓
- **`network.js`**: `join_lobby_response` handler works correctly ✓
- **`main.js`**: `onLobbyJoined()` method processes the data ✓
- **`ui.js`**: Scene initialization works ✓

## Summary

**Issue**: Race condition causing `joined_lobby` event to fire before listener was set up

**Fix**: Use returned promise data instead of relying on callback event

**Result**: Game now loads immediately after login and is fully playable! 🎮

---

**Status**: ✅ FIXED - Game fully loads and plays
