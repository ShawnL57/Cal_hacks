# 🦆 Duck Controller - Quick Start Guide

## 3-Step Setup (5 minutes)

### Step 1: Install Dependencies

```bash
# Install Rust (if not installed)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Install Node.js from https://nodejs.org/ (if not installed)

# Install Python 3 (if not installed - usually pre-installed on macOS)
python3 --version
```

### Step 2: Start the Application

**Single command** - Python backend auto-starts! 🚀
```bash
cd annoying-duck-extension/calhackproj

# Install Python dependencies first (one time only)
pip3 install -r ../python-backend/requirements.txt

# Start Tauri (automatically launches Python backend)
npm install
npm run tauri dev
```

✨ **That's it!** Tauri will automatically:
- Start the Python backend as a subprocess
- Start the HTTP server (port 3030)
- Start the WebSocket server
- Open the dashboard window

When you close Tauri, Python backend automatically stops too!

### Step 3: Install Browser Extension

1. Open Chrome/Edge
2. Go to `chrome://extensions/`
3. Toggle **Developer mode** ON (top right)
4. Click **Load unpacked**
5. Select folder: `annoying-duck-extension/browser-extension`
6. Done! 🎉

---

## ✅ Testing It Works

1. **Check Tauri Dashboard** (should open automatically)
   - Services Status should show all green ✓
   - Extension Connected: Yes

2. **Open Any Website** (e.g., google.com)
   - Within 5-10 seconds, you'll see: 🦆 Duck messages appear!

3. **Check Extension Popup**
   - Click the duck extension icon
   - Status should show "Connected"
   - Message count should increase

---

## 🐛 Troubleshooting

### "Port already in use"
The Python backend will automatically try ports 5000-5005 if 5000 is busy.
If port 3030 is busy:
```bash
lsof -ti:3030 | xargs kill -9
```

### Extension won't connect
1. Ensure Tauri app started successfully (check terminal for "WebSocket Server started")
2. Click extension icon → "Reconnect"
3. Check browser console (F12) for errors

### No messages appearing
1. Check Tauri terminal shows Python started: "✅ Python subprocess launched successfully"
2. Check Tauri terminal shows: "📨 Received from Python"
3. Wait 5-10 seconds (that's the message interval)
4. Reload the webpage if needed

### Icons missing in extension
```bash
cd browser-extension
# If you have ImageMagick:
./create_icons.sh

# Or if you have Python PIL:
pip3 install pillow
python3 create_icons.py
```

---

## 🎮 Usage

### View Messages
- **Desktop App**: Real-time activity log in the dashboard
- **Web Pages**: Floating notifications (auto-dismiss after 5s)
- **Extension Popup**: Click extension icon to see status

### Customize Messages
Edit `python-backend/main.py`:
```python
DUCK_MESSAGES = [
    "🦆 Your custom message!",
    "🦆 Add more here!",
]
```

### Change Message Frequency
Edit `python-backend/main.py`:
```python
MESSAGE_INTERVAL_MIN = 3  # Faster (3-7 seconds)
MESSAGE_INTERVAL_MAX = 7
```

---

## 🎯 What You Built

**Message Flow:**
```
Python (random generator)
  → HTTP POST →
Tauri (Rust backend)
  → WebSocket →
Browser Extension
  → Display on webpage
```

**Tech Stack:**
- **Python**: Flask backend, random message generator
- **Rust**: Axum HTTP server, WebSocket server
- **React**: Dashboard UI
- **JavaScript**: Chrome extension (Manifest V3)

---

## 🚀 Next Features to Add

Easy additions you can make:
- [ ] Add sound effects on message arrival
- [ ] Custom duck images/GIFs instead of emoji
- [ ] Click duck messages to dismiss
- [ ] Different message types (info, warning, fun)
- [ ] Message history in dashboard
- [ ] Settings panel (frequency, colors, sounds)

---

## 📚 Learn More

- Full documentation: `README.md`
- Tauri docs: https://tauri.app
- Chrome extension docs: https://developer.chrome.com/docs/extensions/

---

## 🦆 Enjoy!

Your duck messages are now live! Every webpage you visit will be blessed with random duck wisdom.

**Pro tip:** Keep the Tauri dashboard open to watch messages flow in real-time!
