#!/bin/bash
# Development startup script for Duck Controller
# This script helps start all services in the correct order

echo "🦆 Duck Controller - Development Startup"
echo "========================================"
echo ""

# Check if running on macOS
if [[ "$OSTYPE" != "darwin"* ]]; then
    echo "This script is designed for macOS. Adjust for your OS."
fi

# Function to check if a port is in use
check_port() {
    if lsof -Pi :$1 -sTCP:LISTEN -t >/dev/null ; then
        echo "⚠️  Port $1 is already in use!"
        return 1
    fi
    return 0
}

# Check if required commands exist
command -v python3 >/dev/null 2>&1 || { echo "❌ python3 is required but not installed."; exit 1; }
command -v npm >/dev/null 2>&1 || { echo "❌ npm is required but not installed."; exit 1; }
command -v cargo >/dev/null 2>&1 || { echo "❌ cargo (Rust) is required but not installed."; exit 1; }

# Check ports
echo "🔍 Checking ports..."
check_port 3030 || exit 1
check_port 5000 || exit 1
check_port 1420 || exit 1
echo "✅ All ports available"
echo ""

# Check if Python dependencies are installed
if [ ! -f "python-backend/venv/bin/activate" ]; then
    echo "📦 Setting up Python virtual environment..."
    cd python-backend
    python3 -m venv venv
    source venv/bin/activate
    pip install -r requirements.txt
    cd ..
    echo "✅ Python setup complete"
    echo ""
fi

# Check if Node dependencies are installed
if [ ! -d "calhackproj/node_modules" ]; then
    echo "📦 Installing Node dependencies..."
    cd calhackproj
    npm install
    cd ..
    echo "✅ Node setup complete"
    echo ""
fi

echo "🚀 Starting services..."
echo ""
echo "This will open 2 terminal windows:"
echo "  1. Tauri Desktop App (Rust + React)"
echo "  2. Python Backend"
echo ""
echo "Press Ctrl+C in any window to stop all services"
echo ""

# Start Tauri in a new terminal
echo "🎨 Starting Tauri Desktop App..."
osascript <<END
tell application "Terminal"
    do script "cd \"$(pwd)/calhackproj\" && echo '🦆 Starting Tauri Desktop App...' && npm run tauri dev"
end tell
END

sleep 2

# Start Python backend in a new terminal
echo "🐍 Starting Python Backend..."
osascript <<END
tell application "Terminal"
    do script "cd \"$(pwd)/python-backend\" && source venv/bin/activate && echo '🦆 Starting Python Backend...' && python3 main.py"
end tell
END

echo ""
echo "✅ All services starting!"
echo ""
echo "📊 What's running:"
echo "  - Tauri Desktop App: http://localhost:1420"
echo "  - Tauri HTTP API: http://localhost:3030"
echo "  - Tauri WebSocket: ws://localhost:3030/ws"
echo "  - Python Backend: http://localhost:5000"
echo ""
echo "🔧 Next steps:"
echo "  1. Wait for both windows to finish starting"
echo "  2. Open Chrome → chrome://extensions/"
echo "  3. Enable Developer mode → Load unpacked"
echo "  4. Select the 'browser-extension' folder"
echo "  5. Visit any website to see duck messages!"
echo ""
echo "🦆 Happy Ducking!"
