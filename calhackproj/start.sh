#!/bin/bash

# Duck Focus Monitor - Single Command Startup Script
# This script starts all required services in parallel

echo "🦆 Duck Focus Monitor - Starting all services..."
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if Muse device name is provided
MUSE_DEVICE=${1:-"Muse-215A"}

# Function to cleanup background processes on exit
cleanup() {
    echo ""
    echo "${YELLOW}🛑 Shutting down all services...${NC}"
    # Kill all background jobs
    jobs -p | xargs -r kill 2>/dev/null
    exit 0
}

# Trap CTRL+C and call cleanup
trap cleanup INT TERM

# 1. Start Muse LSL Stream
echo "${GREEN}[1/3] Starting Muse LSL stream for device: $MUSE_DEVICE${NC}"
export DYLD_LIBRARY_PATH=/opt/homebrew/lib
(
    muselsl stream --name "$MUSE_DEVICE" --ppg --acc --gyro 2>&1 | while IFS= read -r line; do
        echo "[MUSE] $line"
    done
) &
MUSE_PID=$!
sleep 2  # Give Muse time to connect

# 2. Start Python Backend
echo "${GREEN}[2/3] Starting Python backend...${NC}"
cd python-backend || exit 1
(
    source venv/bin/activate 2>/dev/null || { echo "${RED}Error: Python venv not found. Run setup first.${NC}"; exit 1; }
    python main.py 2>&1 | while IFS= read -r line; do
        echo "[PYTHON] $line"
    done
) &
PYTHON_PID=$!
cd ..
sleep 3  # Give Python time to start

# 3. Start Tauri App
echo "${GREEN}[3/3] Starting Tauri app...${NC}"
(
    npm run tauri dev 2>&1 | while IFS= read -r line; do
        echo "[TAURI] $line"
    done
) &
TAURI_PID=$!

echo ""
echo "${GREEN}✅ All services started!${NC}"
echo ""
echo "📋 Service URLs:"
echo "  - Tauri Dashboard: http://localhost:1420"
echo "  - Python API: http://localhost:5001"
echo "  - WebSocket: ws://localhost:3030/ws"
echo ""
echo "📝 Next steps:"
echo "  1. Load Chrome extension from: AnnoyingDuckExtension/"
echo "  2. Open any website in Chrome"
echo "  3. Get distracted to see the duck!"
echo ""
echo "${YELLOW}Press CTRL+C to stop all services${NC}"
echo ""

# Wait for all background processes
wait
