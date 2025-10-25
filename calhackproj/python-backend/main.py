#!/usr/bin/env python3
"""
Duck Controller - Python Backend
Sends random duck commands to the Tauri app at random intervals
"""

import time
import random
import requests
import threading
from flask import Flask, jsonify
from datetime import datetime

app = Flask(__name__)

# Configuration
TAURI_HTTP_URL = "http://localhost:3030/api/message"
MESSAGE_INTERVAL_MIN = 5  # seconds
MESSAGE_INTERVAL_MAX = 10  # seconds
PORT_RANGE = range(5000, 5006)  # Try ports 5000-5005

# Duck messages/commands
DUCK_MESSAGES = [
    "🦆 QUACK!",
    "🦆 Honk honk!",
    "🦆 Feed me bread!",
    "🦆 I'm watching you...",
    "🦆 Ducks rule!",
    "🦆 Time for a swim!",
    "🦆 Waddle waddle!",
    "🦆 Got any grapes?",
]

# State
message_count = 0
is_running = True


def send_message_to_tauri(message: str):
    """Send a message to the Tauri backend via HTTP POST"""
    try:
        payload = {
            "message": message,
            "timestamp": datetime.now().isoformat(),
            "type": "duck_message"
        }
        response = requests.post(TAURI_HTTP_URL, json=payload, timeout=2)
        if response.status_code == 200:
            print(f"✓ Sent to Tauri: {message}")
            return True
        else:
            print(f"✗ Failed to send (status {response.status_code}): {message}")
            return False
    except requests.exceptions.RequestException as e:
        print(f"✗ Connection error to Tauri: {e}")
        return False


def random_message_loop():
    """Background thread that sends random messages at random intervals"""
    global message_count
    print("🦆 Random message loop started!")

    while is_running:
        # Wait for random interval
        interval = random.uniform(MESSAGE_INTERVAL_MIN, MESSAGE_INTERVAL_MAX)
        time.sleep(interval)

        # Pick random message
        message = random.choice(DUCK_MESSAGES)

        # Send to Tauri
        if send_message_to_tauri(message):
            message_count += 1
            print(f"📊 Total messages sent: {message_count}")


# Flask endpoints
@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint"""
    return jsonify({
        "status": "running",
        "messages_sent": message_count,
        "timestamp": datetime.now().isoformat()
    }), 200


@app.route('/api/stats', methods=['GET'])
def stats():
    """Get statistics"""
    return jsonify({
        "messages_sent": message_count,
        "is_running": is_running,
        "timestamp": datetime.now().isoformat()
    }), 200


@app.route('/api/send-now', methods=['POST'])
def send_now():
    """Manually trigger a message send"""
    message = random.choice(DUCK_MESSAGES)
    success = send_message_to_tauri(message)
    return jsonify({
        "success": success,
        "message": message
    }), 200 if success else 500


def start_background_loop():
    """Start the random message background thread"""
    thread = threading.Thread(target=random_message_loop, daemon=True)
    thread.start()
    print("🚀 Background message sender started")


def find_available_port():
    """Find an available port from the range"""
    import socket
    for port in PORT_RANGE:
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                s.bind(('127.0.0.1', port))
                return port
        except OSError:
            continue
    raise RuntimeError("No available ports in range 5000-5005")


if __name__ == '__main__':
    print("=" * 50)
    print("🦆 Duck Controller - Python Backend")
    print("=" * 50)
    print(f"Tauri endpoint: {TAURI_HTTP_URL}")
    print(f"Message interval: {MESSAGE_INTERVAL_MIN}-{MESSAGE_INTERVAL_MAX}s")
    print("=" * 50)

    # Find available port
    port = find_available_port()
    print(f"🌐 Using port: {port}")

    # Start background message sender
    start_background_loop()

    # Start Flask server
    print(f"🌐 Starting Flask server on port {port}...")
    app.run(host='127.0.0.1', port=port, debug=False)
