# 🦆 Duck Controller - Complete Application

A desktop application that sends random duck messages from Python → Tauri → Browser Extension, displaying them on any webpage.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                 Python Backend (Port 5000)               │
│  - Random message generator                              │
│  - Sends messages every 5-10 seconds                     │
└─────────────────────┬───────────────────────────────────┘
                      │ HTTP POST
                      ↓
┌─────────────────────────────────────────────────────────┐
│            Tauri Desktop App (Rust + React)              │
│  - HTTP Server (Port 3030) - receives from Python       │
│  - WebSocket Server (Port 3030/ws) - sends to extension │
│  - React Dashboard - displays activity                   │
└─────────────────────┬───────────────────────────────────┘
                      │ WebSocket
                      ↓
┌─────────────────────────────────────────────────────────┐
│              Browser Extension (Chrome/Edge)             │
│  - Background service worker                             │
│  - Content script injection                              │
│  - Displays duck messages on all web pages               │
└─────────────────────────────────────────────────────────┘
```

---

## 🚀 Quick Start

### Prerequisites

- **Rust** (latest stable) - [Install](https://rustup.rs/)
- **Node.js 18+** - [Install](https://nodejs.org/)
- **Python 3.8+** - [Install](https://www.python.org/)
- **Chrome/Edge Browser**

---

## 📦 Installation

### 1. Setup Tauri Desktop App

```bash
cd calhackproj

# Install dependencies
npm install

# Run in development mode
npm run tauri dev
```

This will:
- Start the React frontend on `http://localhost:1420`
- Start the Rust backend with HTTP server on `http://localhost:3030`
- Start WebSocket server on `ws://localhost:3030/ws`

### 2. Setup Python Backend

```bash
cd python-backend

# Create virtual environment (optional but recommended)
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Run the backend
python3 main.py
```

The Python backend will:
- Start Flask server on port 5000
- Automatically send random duck messages every 5-10 seconds
- Post messages to Tauri at `http://localhost:3030/api/message`

### 3. Install Browser Extension

1. Open Chrome/Edge
2. Navigate to `chrome://extensions/` (or `edge://extensions/`)
3. Enable **Developer mode** (toggle in top-right)
4. Click **Load unpacked**
5. Select the `browser-extension` folder
6. The extension icon should appear in your toolbar

---

## 🎮 Usage

### Running the Complete System

**Terminal 1: Start Tauri App**
```bash
cd calhackproj
npm run tauri dev
```

**Terminal 2: Start Python Backend**
```bash
cd python-backend
python3 main.py
```

**Browser: Enable Extension**
- Extension auto-connects to Tauri WebSocket
- Visit any website (e.g., google.com, youtube.com)
- Duck messages will appear as floating notifications!

---

## 📊 What Each Component Does

### Python Backend (`python-backend/main.py`)
- Generates random duck messages every 5-10 seconds
- Posts them to Tauri's HTTP endpoint
- Endpoints:
  - `GET /health` - Health check
  - `GET /api/stats` - View statistics
  - `POST /api/send-now` - Manually trigger a message

### Tauri Backend (`calhackproj/src-tauri/src/lib.rs`)
- **HTTP Server (Port 3030)**
  - `POST /api/message` - Receives messages from Python
  - `GET /health` - Health check
- **WebSocket Server (Port 3030/ws)**
  - Broadcasts messages to all connected browser extensions
- **Tauri Commands**
  - `get_service_status` - Returns status of all services

### React Frontend (`calhackproj/src/App.tsx`)
- Beautiful dashboard showing:
  - Service status (HTTP, WebSocket, Extension)
  - Message count
  - Real-time activity log
  - Setup instructions

### Browser Extension (`browser-extension/`)
- **Background Worker** (`background.js`)
  - Connects to Tauri WebSocket
  - Auto-reconnects on disconnect
  - Forwards messages to content scripts
- **Content Script** (`content.js`)
  - Injects messages into web pages
  - Beautiful floating notifications
  - Auto-dismisses after 5 seconds
- **Popup** (`popup.html`)
  - Shows connection status
  - Message statistics
  - Manual reconnect button

---

## 🔧 Configuration

### Python Backend

Edit `python-backend/main.py`:
```python
TAURI_HTTP_URL = "http://localhost:3030/api/message"
MESSAGE_INTERVAL_MIN = 5  # seconds
MESSAGE_INTERVAL_MAX = 10  # seconds
```

### Browser Extension

Edit `browser-extension/background.js`:
```javascript
const WEBSOCKET_URL = 'ws://127.0.0.1:3030/ws';
const RECONNECT_INTERVAL = 3000; // 3 seconds
const MAX_RECONNECT_ATTEMPTS = 10;
```

---

## 🐛 Troubleshooting

### Extension Not Connecting

1. Check Tauri app is running: `http://localhost:3030/health`
2. Check WebSocket server in terminal logs
3. Open extension popup → Click "Reconnect"
4. Check browser console (F12) for errors

### Python Backend Can't Connect

1. Ensure Tauri app is running first
2. Check Tauri logs for HTTP server status
3. Try manual send: `curl -X POST http://localhost:3030/api/message -H "Content-Type: application/json" -d '{"message":"Test","timestamp":"2024-01-01T00:00:00Z","type":"test"}'`

### No Messages Appearing

1. Check Python backend logs - should show "Sent to Tauri"
2. Check Tauri logs - should show "Received from Python"
3. Check extension background worker console:
   - Right-click extension icon → "Inspect service worker"
4. Check webpage console (F12) - should show "Received duck message"

### Port Already in Use

If port 3030 or 5000 is taken:
- Change ports in code (see Configuration section)
- Kill existing processes: `lsof -ti:3030 | xargs kill -9`

---

## 📝 Development

### Build for Production

**Tauri App:**
```bash
cd calhackproj
npm run tauri build
```

**Python Backend (Executable):**
```bash
cd python-backend
pip install pyinstaller
pyinstaller --onefile main.py
```

**Browser Extension:**
- Zip the `browser-extension` folder
- Upload to Chrome Web Store

---

## 🎨 Customization

### Add More Duck Messages

Edit `python-backend/main.py`:
```python
DUCK_MESSAGES = [
    "🦆 Your custom message!",
    "🦆 Another message!",
    # Add more...
]
```

### Change Message Display Style

Edit `browser-extension/content.js` - modify the `createMessageBox()` function CSS.

### Adjust Message Frequency

Edit `python-backend/main.py`:
```python
MESSAGE_INTERVAL_MIN = 2  # Faster
MESSAGE_INTERVAL_MAX = 5
```

---

## 📚 File Structure

```
annoying-duck-extension/
├── calhackproj/              # Tauri Desktop App
│   ├── src/                  # React Frontend
│   │   ├── App.tsx          # Main dashboard
│   │   └── App.css          # Styling
│   ├── src-tauri/           # Rust Backend
│   │   ├── src/
│   │   │   └── lib.rs       # HTTP + WebSocket server
│   │   └── Cargo.toml       # Rust dependencies
│   └── package.json
├── python-backend/           # Python Backend
│   ├── main.py              # Flask server + message generator
│   └── requirements.txt     # Python dependencies
├── browser-extension/        # Chrome Extension
│   ├── manifest.json        # Extension config
│   ├── background.js        # Service worker
│   ├── content.js           # Page injection
│   ├── popup.html           # Popup UI
│   └── popup.js             # Popup logic
└── README.md                # This file
```

---

## 🚦 Testing the Flow

1. **Start Tauri**: Should see "HTTP Server started" in terminal
2. **Start Python**: Should see "Random message loop started!"
3. **Load Extension**: Check popup shows "Connected"
4. **Open any website**: Within 5-10 seconds, a duck message appears!
5. **Check Tauri Dashboard**: Messages logged in real-time

---

## 🎯 Next Steps / Enhancements

- [ ] Add Python as Tauri sidecar (auto-start with app)
- [ ] Add native messaging for direct extension ↔ Tauri communication
- [ ] Persistent storage for message history
- [ ] Settings panel (message frequency, colors, sounds)
- [ ] Multiple duck themes/GIFs
- [ ] Desktop notifications
- [ ] System tray integration

---

## 📄 License

MIT License - Feel free to modify and use!

---

## 🦆 Enjoy Your Ducks!

Questions? Issues? Create a GitHub issue or check the troubleshooting section above.

**Happy Ducking! 🦆**
