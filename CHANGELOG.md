# 🦆 Duck Controller - Changelog

## Version 1.1.0 - 2024-10-25

### ✨ New Features
- **Python Auto-Launch**: Rust backend now automatically launches Python backend as a subprocess
  - No need to run Python manually in a separate terminal!
  - Python process is automatically killed when Tauri app closes
  - Graceful error handling if Python fails to start

- **Port Auto-Selection**: Python backend now tries ports 5000-5005
  - No more "port already in use" errors!
  - Automatically finds an available port in the range

### 🔧 Improvements
- Simplified startup process - only one command needed
- Better error messages if Python launch fails
- Clean shutdown of all services when app closes

### 📚 Documentation Updates
- Updated QUICKSTART.md with simplified instructions
- Added process management details to README
- Updated TESTING.md with new subprocess behavior

---

## Version 1.0.0 - 2024-10-25

### 🎉 Initial Release

**Core Features:**
- Python backend with random duck message generator
- Tauri desktop app with HTTP + WebSocket servers
- React dashboard with real-time activity log
- Chrome/Edge browser extension (Manifest V3)
- Beautiful gradient UI with animations
- Auto-reconnection logic
- Service status monitoring
- Comprehensive documentation

**Tech Stack:**
- Python 3.8+ (Flask)
- Rust (Tauri 2.0, Axum, Tokio)
- TypeScript + React 18
- JavaScript (Chrome Extension)

**Architecture:**
```
Python → HTTP → Rust/Tauri → WebSocket → Browser Extension
```

---

## Upgrade Guide

### From 1.0.0 to 1.1.0

**No breaking changes!** The new version is backward compatible.

**What changed:**
- You no longer need to run Python manually
- Python dependencies must be installed before first run: `pip3 install -r python-backend/requirements.txt`
- Startup script is now optional (but still works for manual control)

**To upgrade:**
1. Pull latest code
2. Install Python dependencies: `cd calhackproj && pip3 install -r ../python-backend/requirements.txt`
3. Run Tauri: `npm run tauri dev`
4. That's it! Python auto-starts now.

---

## Future Roadmap

### Version 1.2.0 (Planned)
- [ ] Native messaging support (direct extension ↔ Tauri)
- [ ] System tray integration
- [ ] Desktop notifications
- [ ] Message history persistence

### Version 1.3.0 (Planned)
- [ ] Settings panel (UI for configuration)
- [ ] Custom duck images/GIFs
- [ ] Sound effects
- [ ] Multiple message themes

### Version 2.0.0 (Future)
- [ ] Python bundled as sidecar (no separate Python install needed)
- [ ] Auto-updater
- [ ] Plugin system
- [ ] Cloud sync
