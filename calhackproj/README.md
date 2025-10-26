# 🦆 Duck Focus Monitor

A real-time brain activity monitoring system that uses Muse 2 EEG headset to detect when you lose focus and spawns an annoying duck in your browser to bring you back on track.

## System Architecture

```
Muse 2 EEG Headset
    ↓ (LSL - Lab Streaming Layer)
Python Backend (Flask)
    ↓ (HTTP)
Tauri Desktop App (Rust + React)
    ↓ (WebSocket)
Chrome Extension
    ↓
Browser (Duck Animation)
```

## Features

- 🧠 Real-time EEG monitoring with Muse 2 headset
- 📊 Live brain metrics (focus level, brain state, heart rate, head orientation)
- 🦆 Automatic duck spawning when distraction is detected (2+ seconds)
- 🎬 **Focus restoration videos** - Personalized duck videos generated from your screen activity, sent when you regain focus
- ⌨️ **Focus calibration typing test** - 60-second typing test that measures your focused brain activity to establish a personalized baseline
- 🎯 Activity log with focus state changes
- 🔄 Auto-reconnection for all services

## Prerequisites

- macOS (or Linux/Windows with minor adjustments)
- Muse 2 EEG headset
- Python 3.11+
- Node.js 18+
- Rust (for Tauri)
- Chrome browser

## 🚀 Quick Start (2 Commands!)

### 1. One-Time Setup

```bash
git clone https://github.com/ShawnL57/Cal_hacks.git
cd Cal_hacks/calhackproj
./setup.sh
```

This will:
- ✅ Create Python virtual environment
- ✅ Install all Python dependencies
- ✅ Install Node.js dependencies
- ✅ Build Chrome extension
- ✅ Install Muse LSL tools
- ✅ Create `.env` template

### 2. Configure API Keys

Edit `python-backend/.env` and add your API keys:
```bash
ANTHROPIC_API_KEY=your_actual_api_key_here
FISH_AUDIO_API_KEY=your_fish_audio_key_here
```

**Important:** Remove any spaces around `=` signs in the `.env` file.

### 2.5. Install Fish Audio SDK (Required for Video Generation)

```bash
brew install fish-audio-sdk
```

This enables the focus restoration video feature that generates personalized duck videos when you regain focus.

### 3. Find Your Muse Device

```bash
export DYLD_LIBRARY_PATH=/opt/homebrew/lib
muselsl list
# Example output: Found device: Muse-215A
```

### 4. Start Everything with One Command! 🎉

```bash
./start.sh Muse-215A  # Replace with your device name
```

This single command starts:
- 🧠 Muse LSL stream
- 🐍 Python backend
- 🖥️ Tauri desktop app

Press `CTRL+C` to stop all services.

### 5. Load Chrome Extension

1. Open `chrome://extensions/` in Chrome
2. Enable **Developer mode** (toggle top-right)
3. Click **Load unpacked**
4. Select `AnnoyingDuckExtension/` folder
5. Open any website and get distracted to see the duck!

---

## Service URLs

When running, the following services will be available:

- **Tauri Dashboard**: http://localhost:1420
- **Python API**: http://localhost:5001
- **Python Metrics**: http://localhost:5000
- **WebSocket Server**: ws://127.0.0.1:3030/ws

## Common Muse Issues

- **Connection fails**: Make sure headset is charged and Bluetooth is enabled
- **Stream disconnects**: Ensure proper headset fit (all 4 sensors should show good contact)
- **No data**: Check that LSL library path is set correctly
- **Device not found**: Run `muselsl list` to verify device name

## How It Works

### Focus Detection Algorithm

1. **EEG Data Collection**: Muse 2 streams 4-channel EEG at 256 Hz
2. **Feature Extraction**: Theta/Beta ratio (NASA Engagement Index)
3. **Attention Classification**:
   - `focused`: 75%+ focus score
   - `neutral`: 60-75% focus score
   - `distracted`: <60% focus score
   - `drowsy`: Very low theta/beta ratio
4. **State Stability**: 2-second stability period required before triggering
5. **Duck Spawn**: When `distracted`/`drowsy`/`unknown` is stable for 2s

### Focus State Mapping

- `focused` or `neutral` → "focused" (no duck)
- `distracted`, `drowsy`, or `unknown` → "unfocused" (duck spawns!)

### Duck Behavior

- Spawns from random edge (top/bottom/left/right)
- Walks diagonally to center of screen
- Fades out after 4 seconds
- Multiple ducks can spawn if you stay distracted

### Focus Calibration with Typing Test

The typing test provides a personalized calibration for optimal distraction detection:

**How to Calibrate:**
1. Click "📝 Start Focus Calibration Test" button in the dashboard
2. You'll see a 60-second typing test with random text
3. Type as fast and accurately as you can while wearing your Muse headset
4. Your brain activity is recorded throughout the test
5. After 60 seconds, you'll see your average focus score
6. Click "Use Measured Focus as Baseline" to save your personalized baseline

**Why Calibrate?**
- Everyone's brain signals are different
- Your "focused" state might have different EEG patterns than the default
- Calibration improves distraction detection accuracy
- Recommended to calibrate when first setting up the system

**During the Test:**
- **WPM**: Words per minute (typing speed)
- **Accuracy**: Percentage of correctly typed characters
- **Focus Level**: Real-time attention state from EEG
- **Brain State**: Current brain activity classification
- **θ/β Ratio**: Theta/Beta ratio (NASA Engagement Index)

## Browser Extension Features

- **Status Indicator**: Top-left corner shows EEG and Backend connection
- **Keyboard Shortcuts**:
  - `Alt + Left Arrow`: Previous distraction scroll position
  - `Alt + Right Arrow`: Next distraction scroll position
  - `Alt + L`: Show all saved positions
- **Settings**: Open extension popup to configure
  - Always Spawn Duck (for testing without EEG)
  - Enable/Disable Duck

## Project Structure

```
calhackproj/
├── python-backend/          # Flask backend for EEG processing
│   ├── main.py             # Main Flask app + EEG processing
│   ├── attention_classifier.py  # Focus detection algorithm
│   ├── requirements.txt
│   └── .env                # API keys
├── src/                    # Tauri frontend (React)
│   ├── App.tsx            # Main dashboard UI
│   └── TypingTest.tsx     # Focus calibration test
├── src-tauri/             # Tauri backend (Rust)
│   └── src/lib.rs         # HTTP/WebSocket server
└── AnnoyingDuckExtension/  # Chrome extension
    ├── src/
    │   └── content.ts     # Duck animation logic
    ├── manifest.json
    └── dist/              # Built extension

```

## Troubleshooting

### EEG Not Connecting

```bash
# Check if Muse stream is running
muselsl list

# Restart stream
export DYLD_LIBRARY_PATH=/opt/homebrew/lib
muselsl stream --name YOUR_DEVICE_NAME --ppg
```

### Extension Not Working

1. Check WebSocket connections in browser console (F12)
2. Verify extension is loaded: `chrome://extensions/`
3. Check status indicator in top-left of browser page
4. Reload extension if needed

### Duck Not Spawning

1. **Check EEG Connection**: Green dot in extension status indicator
2. **Check Focus State**: You need to be distracted for 2+ seconds
3. **Check Extension Settings**: Make sure "Show Duck" is enabled
4. **Check Console**: Press F12 in Chrome and look for `[DUCK]` messages

### Port Already in Use

```bash
# Find and kill process on port 3030
lsof -ti:3030 | xargs kill -9

# Find and kill process on port 1420
lsof -ti:1420 | xargs kill -9
```

## Development

### Rebuild Extension

```bash
cd AnnoyingDuckExtension
npm run build
# Reload extension in chrome://extensions/
```

### Rebuild Tauri App

```bash
cd calhackproj
npm run tauri dev
```

## Tech Stack

- **Frontend**: React + TypeScript + Vite
- **Desktop App**: Tauri (Rust)
- **Backend**: Python + Flask
- **EEG Processing**: NumPy, SciPy, pylsl
- **Browser Extension**: TypeScript + Chrome Extensions API
- **Communication**: HTTP REST + WebSockets

## Credits

Built for Cal Hacks 2025

## License

MIT
