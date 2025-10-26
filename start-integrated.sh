#!/bin/bash

# Start integrated Muse + Duck system

echo "Starting Muse Attention + Duck Controller System..."

# Start Python backend
cd calhackproj/python-backend
python integrated_backend.py &
BACKEND_PID=$!

# Wait for backend to start
sleep 3

# Start Tauri app
cd ..
npm run tauri dev &
TAURI_PID=$!

echo ""
echo "System started!"
echo "Backend PID: $BACKEND_PID"
echo "Tauri PID: $TAURI_PID"
echo ""
echo "Press Ctrl+C to stop all services"

# Trap Ctrl+C and kill all processes
trap "kill $BACKEND_PID $TAURI_PID; exit" INT

wait
