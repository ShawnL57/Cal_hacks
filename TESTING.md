# 🧪 Duck Controller - Testing Checklist

## Pre-flight Checks

- [ ] Rust installed: `cargo --version`
- [ ] Node.js installed: `node --version` (v18+)
- [ ] Python installed: `python --version` (v3.8+)
- [ ] Ports 3030, 5000, 1420 are free

---

## Test 1: Tauri App Startup ✅

### Steps:
```bash
cd calhackproj
npm install
npm run tauri dev
```

### Expected Results:
- [ ] No compilation errors
- [ ] Window opens with "Duck Controller" title
- [ ] Dashboard displays with purple gradient
- [ ] Terminal shows:
  - `🚀 HTTP Server started on http://127.0.0.1:3030`
  - `🔌 WebSocket Server started on ws://127.0.0.1:3030/ws`

### Verify:
- [ ] Visit http://localhost:3030/health in browser
  - Should return: `{"status":"running","service":"Duck Controller - Tauri Backend"}`

---

## Test 2: Python Backend Startup ✅

### Steps:
```bash
cd python-backend
pip3 install flask requests
python main.py
```

### Expected Results:
- [ ] Terminal shows:
  - `🦆 Duck Controller - Python Backend`
  - `Tauri endpoint: http://localhost:3030/api/message`
  - `🦆 Random message loop started!`
  - `🌐 Starting Flask server on port 5000...`

### Verify:
- [ ] Visit http://localhost:5000/health in browser
  - Should return: `{"status":"running","messages_sent":X,"timestamp":"..."}`

---

## Test 3: Python → Tauri Communication ✅

### Expected Behavior:
Within 10 seconds of starting Python backend:

**In Python Terminal:**
- [ ] See: `✓ Sent to Tauri: 🦆 [message]`
- [ ] See: `📊 Total messages sent: 1`

**In Tauri Terminal:**
- [ ] See: `📨 Received from Python: 🦆 [message]`

**In Tauri Dashboard:**
- [ ] "Messages Received" counter increases
- [ ] Message appears in Activity Log with duck icon
- [ ] Timestamp shows current time

---

## Test 4: Browser Extension Installation ✅

### Steps:
1. Open Chrome/Edge
2. Navigate to `chrome://extensions/`
3. Enable "Developer mode" (top-right toggle)
4. Click "Load unpacked"
5. Select `browser-extension` folder

### Expected Results:
- [ ] Extension appears in list
- [ ] Extension icon appears in toolbar
- [ ] No errors in extension console

### Verify:
- [ ] Click extension icon → popup opens
- [ ] Popup shows "Duck Controller" title
- [ ] Status shows "Connecting..." or "Connected"

---

## Test 5: Extension → Tauri WebSocket Connection ✅

### Steps:
1. Ensure Tauri app is running
2. Load extension (see Test 4)
3. Right-click extension icon → "Inspect service worker"

### Expected Results in Console:
- [ ] See: `🔌 Attempting to connect to Tauri WebSocket...`
- [ ] See: `✅ WebSocket connected to Tauri!`

**In Tauri Terminal:**
- [ ] See: `🔌 WebSocket client connected`

**In Extension Popup:**
- [ ] Status indicator turns green
- [ ] Shows "Connected"

---

## Test 6: Full Message Flow (End-to-End) ✅

### Prerequisites:
- Tauri app running
- Python backend running
- Extension installed and connected

### Test Flow:

**Wait 5-10 seconds for random message**

1. **Python Terminal:**
   - [ ] Shows: `✓ Sent to Tauri: 🦆 QUACK!`

2. **Tauri Terminal:**
   - [ ] Shows: `📨 Received from Python: 🦆 QUACK!`

3. **Tauri Dashboard:**
   - [ ] New message appears in Activity Log
   - [ ] Message counter increments

4. **Extension Background Console:**
   - [ ] Shows: `📨 Received message from Tauri: {message: "🦆 QUACK!", ...}`

5. **Open ANY Website** (e.g., google.com):
   - [ ] **Duck message appears as floating notification!**
   - [ ] Shows duck emoji 🦆
   - [ ] Shows message text
   - [ ] Shows timestamp
   - [ ] Auto-dismisses after 5 seconds
   - [ ] Can click to dismiss early

---

## Test 7: Message Display Behavior ✅

### On a webpage:

- [ ] Message slides in from right
- [ ] Purple gradient background
- [ ] White text, readable
- [ ] Duck emoji visible
- [ ] Timestamp in bottom
- [ ] Hover effect (scales up slightly)
- [ ] Click to dismiss works
- [ ] Auto-dismisses after 5 seconds
- [ ] Multiple messages stack vertically
- [ ] Messages appear on ALL tabs

---

## Test 8: Reconnection & Error Handling ✅

### Scenario A: Restart Tauri App

1. **Stop Tauri app** (Ctrl+C)
2. **In Extension Popup:**
   - [ ] Status turns red: "Disconnected"
3. **Restart Tauri app**
4. **Within 3 seconds:**
   - [ ] Extension auto-reconnects
   - [ ] Status turns green: "Connected"

### Scenario B: Manual Reconnect

1. Stop Tauri app
2. Click extension icon
3. Click "Reconnect" button
4. [ ] Button shows "⏳ Reconnecting..."
5. Start Tauri app
6. [ ] Extension connects successfully

### Scenario C: Python Restart

1. Stop Python backend
2. [ ] Tauri still running, no crashes
3. Restart Python backend
4. [ ] Messages resume flowing

---

## Test 9: Statistics & Monitoring ✅

### In Tauri Dashboard:

- [ ] Service Status section shows all services
- [ ] HTTP Server: Running (green dot)
- [ ] WebSocket Server: Running (green dot)
- [ ] Browser Extension: Connected (green dot)
- [ ] Messages Received count is accurate

### In Extension Popup:

- [ ] Connection status accurate
- [ ] Message count increments
- [ ] Last Connected time accurate
- [ ] Last message preview shows

---

## Test 10: Manual Trigger ✅

### Test Python API:

```bash
curl http://localhost:5000/api/send-now -X POST
```

**Expected:**
- [ ] Immediate duck message sent
- [ ] Appears on webpage instantly
- [ ] Shows in Tauri dashboard

---

## Performance Tests 🚀

### Load Test:
- [ ] Extension handles 10+ messages/second without lag
- [ ] Old messages clean up properly
- [ ] No memory leaks in extension
- [ ] Tauri app stays responsive

### Multi-tab Test:
- [ ] Open 5+ tabs
- [ ] All tabs receive messages
- [ ] No duplicate messages
- [ ] Performance stays smooth

---

## Edge Cases 🔍

### Test: Tauri started AFTER extension
1. Load extension first
2. Start Tauri app
- [ ] Extension auto-connects within 3s

### Test: Visit websites before connection
1. Open tabs before extension loads
2. Load extension
- [ ] Messages appear on all open tabs

### Test: Rapid message spam
Edit Python: `MESSAGE_INTERVAL_MIN = 0.1, MESSAGE_INTERVAL_MAX = 0.2`
- [ ] System handles rapid messages
- [ ] No crashes or freezes
- [ ] UI stays responsive

---

## Browser Compatibility ✅

- [ ] **Chrome**: Works
- [ ] **Edge**: Works
- [ ] **Brave**: Works (Chrome-based)
- [ ] **Firefox**: N/A (needs Manifest V3 port)

---

## Platform Tests 🖥️

- [ ] **macOS**: Fully working
- [ ] **Windows**: (Adjust paths in scripts)
- [ ] **Linux**: (Adjust paths in scripts)

---

## Security Tests 🔒

- [ ] All connections use localhost only
- [ ] No external network requests
- [ ] Extension can't access sensitive data
- [ ] XSS protection in message display

---

## ✅ Success Criteria

**You've successfully tested when:**
1. ✅ Python generates messages every 5-10s
2. ✅ Tauri receives via HTTP
3. ✅ Extension receives via WebSocket
4. ✅ Messages display on ANY webpage
5. ✅ All services recover from restarts
6. ✅ Dashboard shows real-time activity
7. ✅ Extension popup shows accurate status

---

## 🐛 Common Issues & Fixes

| Issue | Fix |
|-------|-----|
| Port in use | `lsof -ti:3030 \| xargs kill -9` |
| Extension won't load | Check manifest.json syntax |
| No connection | Ensure Tauri started first |
| No messages | Check Python terminal for errors |
| Icons missing | Run `./create_icons.sh` |

---

## 🎯 Ready for Demo!

If all tests pass, your Duck Controller is ready to show off! 🦆🎉
