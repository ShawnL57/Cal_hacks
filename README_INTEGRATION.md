# Muse Attention + Duck Controller Integration

## Quick Start

```bash
./start-integrated.sh
```

## Manual Start

### 1. Start Python Backend (Muse + API)
```bash
cd calhackproj/python-backend
pip install -r requirements.txt
python integrated_backend.py
```

### 2. Start Tauri App
```bash
cd calhackproj
npm install
npm run tauri dev
```

## Features

- Real-time EEG monitoring from Muse 2
- Attention/Focus classification
- Typing test for focus calibration
- Duck controller integration
- Browser extension support

## API Endpoints

- `GET /health` - Backend health check
- `GET /api/metrics` - Current brain metrics
- `POST /api/calibrate` - Auto-calibrate from current state
- `POST /api/calibrate-with-score` - Calibrate with typing test score
- `GET /api/typing-words` - Get random typing test words
- `POST /api/clear` - Clear all data buffers

## Architecture

```
┌─────────────────┐
│   Muse 2 EEG    │
└────────┬────────┘
         │ LSL
         ▼
┌─────────────────┐
│ Python Backend  │◄──── REST API ────┐
│ (Flask:5001)    │                   │
└────────┬────────┘                   │
         │                            │
         ▼                            │
┌─────────────────┐            ┌──────────────┐
│  Tauri Desktop  │            │  React UI    │
│   (Rust HTTP)   │◄───────────┤  Components  │
└────────┬────────┘            └──────────────┘
         │
         ▼
┌─────────────────┐
│ Browser Ext     │
│ (WebSocket)     │
└─────────────────┘
```

## Files

- `calhackproj/python-backend/integrated_backend.py` - Main Flask backend
- `calhackproj/python-backend/attention_classifier.py` - EEG analysis
- `calhackproj/src/TypingTest.tsx` - Focus calibration UI
- `calhackproj/src/App.tsx` - Main dashboard
