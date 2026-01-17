# Quick Test Guide - Player Persistence

## Start the Game
```bash
npm start
# Visit http://localhost:3000
```

## Test 1: First Login
1. Open http://localhost:3000 in browser
2. See login screen with "BLINK ROYALE" title
3. Type username: `TestPlayer`
4. Click "JOIN GAME"
5. **Expected**: You enter a lobby and can play
6. **Verify**: Open browser console → `localStorage.getItem('playerId')` shows your ID

## Test 2: Page Reload (Within Same Session)
1. After joining a lobby, press **F5** to refresh
2. Login form appears with **"TestPlayer"** pre-filled
3. Click "JOIN GAME" or press **Enter**
4. **Expected**: You rejoin the same lobby, game state continues
5. **Verify**: Console shows `Attempting to reconnect as player: [YOUR_ID]`

## Test 3: Close & Reopen Browser
1. After joining, **close entire browser tab/window**
2. Reopen http://localhost:3000
3. Login form appears with username pre-filled
4. Click "JOIN GAME"
5. **Expected**: Rejoin same lobby
6. **Verify**: Game doesn't reset, your player is still there

## Test 4: Grace Period (Disconnect & Quick Reconnect)
1. Join a lobby with your player
2. Open browser **DevTools** (F12)
3. Go to **Network tab** → Right-click → **Throttling** → "Offline"
4. Wait 5-10 seconds (socket disconnects)
5. Set throttling back to "No throttling" (or close DevTools)
6. Refresh page or wait for automatic reconnection
7. **Expected**: You rejoin the same lobby within 60 seconds
8. **Verify**: No "new player joined" message, game state preserved

## Test 5: Grace Period Expired (Offline 60+ seconds)
1. Join a lobby
2. Go to DevTools **Network tab** → **Offline** mode
3. Wait **70+ seconds**
4. Go back to **No throttling**
5. Refresh page
6. **Expected**: Login as **new player** (different ID)
7. **Verify**: `localStorage.getItem('playerId')` shows **new ID**

## Test 6: Multiple Players Simultaneously
**Terminal 1**: Run `npm start`

**Terminal 2**: Join as Player A
```bash
# Open 2 browser windows
# Window 1: Login as "Alice", join lobby
# Window 2: Login as "Bob", should join same lobby
```

**Test reconnection**:
1. Have both Alice and Bob in same lobby
2. Close Bob's tab
3. Within 60 seconds, reopen/reload Bob's page
4. **Expected**: Bob rejoins, Alice still sees Bob in lobby

## Test 7: Clear Storage & Fresh Start
1. Open browser **DevTools** → **Storage/Application tab**
2. **Local Storage** → http://localhost:3000 → Delete all entries
3. Refresh page
4. **Expected**: See login screen with empty username field
5. **Verify**: You're a completely new player (new ID)

## Test 8: Multiple Lobbies
1. Have **Lobby 1** with Alice
2. Have **Lobby 2** with Bob
3. Bob refreshes page within grace period
4. **Expected**: Bob goes back to Lobby 2 (not Lobby 1)
5. **Verify**: Player IDs are unique per lobby

## Console Debugging

Open DevTools **Console** tab to see:

```javascript
// See connection logs
[Network] Connecting to server...
[Network] Connected to server (socket: abc123...)
[Network] Attempting to reconnect as player: xyz789...

// See player ID
localStorage.getItem('playerId')

// See full session
JSON.parse(localStorage.getItem('playerSession'))

// See username
localStorage.getItem('lastUsername')
```

## Network Logs (Server Side)

Watch the terminal running `npm start`:

```
[INFO] Join lobby request: socket_id { username: 'TestPlayer', previousPlayerId: 'abc123...' }
[INFO] Player abc123... reconnecting to lobby lobby_1
[INFO] Player disconnected: abc123... from lobby lobby_1
[INFO] Stored player ID for potential reconnection: abc123...
[INFO] Player permanently removed after reconnect timeout: abc123...
```

## What Should You See?

### Good Behavior ✅
- [ ] Login screen on first visit
- [ ] Username pre-filled on reload
- [ ] Rejoin same lobby after refresh
- [ ] Server logs show "reconnecting" within 60 seconds
- [ ] Different player ID after 60+ second disconnect

### Bad Behavior ❌
- [ ] Getting new ID every refresh
- [ ] Login screen shows empty username
- [ ] Joining different lobby after reload
- [ ] Server crashes on reconnection
- [ ] No localStorage entries in DevTools

## Troubleshooting

**Q: I refreshed but got a new ID**
- A: Check DevTools Storage → make sure localStorage has `playerId` and `lastUsername`
- A: Check browser isn't in private/incognito mode (localStorage disabled)

**Q: I can't rejoin my lobby**
- A: Check server logs - you may have exceeded 60-second grace period
- A: Verify the server is still running (`npm start` in terminal)

**Q: Console shows connection errors**
- A: Make sure server is running on port 3000
- A: Check firewall isn't blocking localhost:3000
- A: Try `curl http://localhost:3000` in another terminal

**Q: Multiple players not in same lobby**
- A: Make sure both open same URL (http://localhost:3000)
- A: Check server logs for "No lobbies available"
- A: Verify `MAX_LOBBIES` setting in `server/config.js`

## Expected Timeline

```
0s   - Player joins lobby (playerId: abc123)
30s  - Player refreshes page
       → Rejoins same lobby ✅
       → Server logs "reconnecting to lobby"

60s  - Player still disconnected
65s  - Player now tries to rejoin
       → Gets new playerId (xyz789) ✅
       → Old session permanently removed
```

## Next Steps

After testing works:
1. Read [PLAYER_PERSISTENCE.md](PLAYER_PERSISTENCE.md) for technical details
2. Try the game with friends on same network
3. Deploy to production if needed
4. Monitor server logs for issues

## Still Have Questions?

Check the [PLAYER_PERSISTENCE.md](PLAYER_PERSISTENCE.md) file for:
- How it works internally
- Configuration options
- Server-side logic details
- Advanced debugging
