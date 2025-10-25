#!/usr/bin/env python3
"""
Full Muse 2 EEG + Motion Tracking with Real-Time Visualization
Includes: EEG, PPG (heart rate), Accelerometer, Gyroscope
"""
import os
import threading
import time
from collections import deque
from flask import Flask, render_template_string, jsonify, request
from pylsl import StreamInlet, resolve_streams
import plotly
import plotly.graph_objects as go
import plotly.utils
from plotly.subplots import make_subplots
import json
import numpy as np
import pyttsx3
import math
import requests
from datetime import datetime
from attention_classifier import AttentionClassifier

# Set LSL library path
os.environ['DYLD_LIBRARY_PATH'] = '/opt/homebrew/lib'

# Muse LSL Constants (from muse-lsl repo)
MUSE_SAMPLING_EEG_RATE = 256  # Hz
MUSE_SAMPLING_PPG_RATE = 64   # Hz
MUSE_SAMPLING_ACC_RATE = 52   # Hz
MUSE_SAMPLING_GYRO_RATE = 52  # Hz
LSL_EEG_CHUNK = 12
LSL_PPG_CHUNK = 6
LSL_ACC_CHUNK = 1
LSL_GYRO_CHUNK = 1

# Initialize text-to-speech engine
tts_engine = pyttsx3.init()
tts_engine.setProperty('rate', 150)

# Initialize attention classifier
attention_classifier = AttentionClassifier(sampling_rate=MUSE_SAMPLING_EEG_RATE)

app = Flask(__name__)

# Data buffers (last 10 seconds based on actual sample rates)
data_buffers = {
    'EEG': {
        'TP9': deque(maxlen=MUSE_SAMPLING_EEG_RATE * 10),   # 2560 samples
        'AF7': deque(maxlen=MUSE_SAMPLING_EEG_RATE * 10),
        'AF8': deque(maxlen=MUSE_SAMPLING_EEG_RATE * 10),
        'TP10': deque(maxlen=MUSE_SAMPLING_EEG_RATE * 10),
        'AUX': deque(maxlen=MUSE_SAMPLING_EEG_RATE * 10),   # 5th channel
        'timestamp': deque(maxlen=MUSE_SAMPLING_EEG_RATE * 10)
    },
    'PPG': {
        'PPG1': deque(maxlen=MUSE_SAMPLING_PPG_RATE * 10),  # 640 samples
        'PPG2': deque(maxlen=MUSE_SAMPLING_PPG_RATE * 10),
        'PPG3': deque(maxlen=MUSE_SAMPLING_PPG_RATE * 10),
        'timestamp': deque(maxlen=MUSE_SAMPLING_PPG_RATE * 10)
    },
    'ACC': {
        'X': deque(maxlen=MUSE_SAMPLING_ACC_RATE * 10),     # 520 samples
        'Y': deque(maxlen=MUSE_SAMPLING_ACC_RATE * 10),
        'Z': deque(maxlen=MUSE_SAMPLING_ACC_RATE * 10),
        'timestamp': deque(maxlen=MUSE_SAMPLING_ACC_RATE * 10)
    },
    'GYRO': {
        'X': deque(maxlen=MUSE_SAMPLING_GYRO_RATE * 10),    # 520 samples
        'Y': deque(maxlen=MUSE_SAMPLING_GYRO_RATE * 10),
        'Z': deque(maxlen=MUSE_SAMPLING_GYRO_RATE * 10),
        'timestamp': deque(maxlen=MUSE_SAMPLING_GYRO_RATE * 10)
    },
    'METRICS': {
        'focus_score': deque(maxlen=600),  # 10 min of 1 Hz samples
        'attention_state': deque(maxlen=600),
        'timestamp': deque(maxlen=600)
    }
}

# Current metrics
current_metrics = {
    'head_orientation': 'center',  # left, center, right
    'heart_rate': 0,
    'brain_state': 'unknown',
    'movement_intensity': 0,
    'attention': 'unknown',
    'focus_score': 0.5,
    'distraction_score': 0.5,
    'attention_confidence': 0
}

streaming = False
stream_threads = {}
inlets = {}
last_narration_time = 0
narration_interval = 10
last_classification_time = 0
classification_interval = 0.1  # Classify every 100ms for real-time updates

# Tauri communication
TAURI_URL = "http://localhost:3030/api/message"
last_tauri_send_time = 0
tauri_send_interval = 0.5  # Send to Tauri every 500ms

def send_to_tauri():
    """Send current metrics to Tauri frontend"""
    global last_tauri_send_time

    current_time = time.time()
    if current_time - last_tauri_send_time < tauri_send_interval:
        return

    try:
        # Create message with current metrics
        message = f"Focus: {current_metrics['attention']} ({int(current_metrics['focus_score']*100)}%) | " \
                  f"Brain: {current_metrics['brain_state']} | " \
                  f"HR: {int(current_metrics['heart_rate'])} bpm"

        payload = {
            "message": message,
            "timestamp": datetime.now().isoformat(),
            "type": "brain_metrics",
            "metrics": current_metrics
        }

        response = requests.post(TAURI_URL, json=payload, timeout=1)
        if response.status_code == 200:
            last_tauri_send_time = current_time
    except Exception as e:
        # Silently fail - Tauri might not be running yet
        pass

def connect_to_streams():
    """Connect to all Muse LSL streams"""
    global inlets
    print("Looking for Muse streams...")
    streams = resolve_streams()

    # All required streams
    stream_map = {
        'EEG': 'EEG',
        'PPG': 'PPG',
        'Accelerometer': 'ACC',
        'Gyroscope': 'GYRO'
    }

    connected_count = 0
    for stream_type, buffer_key in stream_map.items():
        matching = [s for s in streams if s.type() == stream_type]
        if matching:
            inlets[buffer_key] = StreamInlet(matching[0])
            print(f"✓ Connected to {stream_type}")
            connected_count += 1
        else:
            print(f"✗ Could not find {stream_type} stream")

    return connected_count == len(stream_map)

def detect_head_orientation():
    """Detect head orientation from accelerometer + gyroscope data"""
    global current_metrics

    try:
        # Get accelerometer data
        acc_x = np.array(list(data_buffers['ACC']['X']))[-50:]
        acc_y = np.array(list(data_buffers['ACC']['Y']))[-50:]
        acc_z = np.array(list(data_buffers['ACC']['Z']))[-50:]

        # Get gyroscope data
        gyro_x = np.array(list(data_buffers['GYRO']['X']))[-50:]
        gyro_y = np.array(list(data_buffers['GYRO']['Y']))[-50:]
        gyro_z = np.array(list(data_buffers['GYRO']['Z']))[-50:]

        # Calculate means
        mean_acc_x = np.mean(acc_x)
        mean_acc_y = np.mean(acc_y)
        mean_acc_z = np.mean(acc_z)

        mean_gyro_x = np.mean(gyro_x)
        mean_gyro_y = np.mean(gyro_y)
        mean_gyro_z = np.mean(gyro_z)

        # Use accelerometer for tilt + gyroscope for rotation
        # Positive X = facing right, Negative X = facing left
        if mean_acc_x > 0.1 or mean_gyro_z > 5:  # Right tilt or clockwise rotation
            current_metrics['head_orientation'] = 'right'
        elif mean_acc_x < -0.1 or mean_gyro_z < -5:  # Left tilt or counter-clockwise rotation
            current_metrics['head_orientation'] = 'left'
        else:
            current_metrics['head_orientation'] = 'center'

        # Calculate movement intensity (combined magnitude of both sensors)
        acc_magnitude = float(np.sqrt(mean_acc_x**2 + mean_acc_y**2 + mean_acc_z**2))
        gyro_magnitude = float(np.sqrt(mean_gyro_x**2 + mean_gyro_y**2 + mean_gyro_z**2))

        # Normalize and combine (accel: 0-10 m/s^2, gyro: 0-245 °/s)
        acc_normalized = min(1.0, acc_magnitude / 10.0)
        gyro_normalized = min(1.0, gyro_magnitude / 245.0)
        current_metrics['movement_intensity'] = (acc_normalized + gyro_normalized) / 2.0

    except Exception as e:
        print(f"Error detecting orientation: {e}")

def calculate_heart_rate():
    """Estimate heart rate from PPG data"""
    if len(data_buffers['PPG']['PPG1']) < 64:
        return 0

    try:
        # Use first PPG channel for heart rate estimation
        ppg_data = np.array(list(data_buffers['PPG']['PPG1']))
        # Simple peak detection for heart rate estimation
        # This is a simplified approach
        std = np.std(ppg_data)
        if std > 0:
            # Rough estimation based on signal variance
            # In practice, more sophisticated algorithm would be used
            estimated_hr = 60 + (std * 10)  # Placeholder calculation
            return min(200, max(40, estimated_hr))
        return 0
    except:
        return 0

def analyze_eeg():
    """Analyze EEG data and determine brain state"""
    global current_metrics

    if not data_buffers['EEG']['TP9'] or len(data_buffers['EEG']['TP9']) < 100:
        return

    try:
        tp9 = np.array(list(data_buffers['EEG']['TP9']))
        af7 = np.array(list(data_buffers['EEG']['AF7']))
        af8 = np.array(list(data_buffers['EEG']['AF8']))
        tp10 = np.array(list(data_buffers['EEG']['TP10']))

        powers = [np.std(tp9), np.std(af7), np.std(af8), np.std(tp10)]
        avg_power = np.mean(powers)

        if avg_power > 20:
            current_metrics['brain_state'] = 'focused'
        elif avg_power > 10:
            current_metrics['brain_state'] = 'engaged'
        else:
            current_metrics['brain_state'] = 'relaxed'
    except:
        pass

def classify_emotion_state():
    """Classify current emotional state from EEG data"""
    global current_metrics

    emotion, valence, arousal, confidence = emotion_classifier.classify_emotion(
        data_buffers['EEG']['TP9'],
        data_buffers['EEG']['AF7'],
        data_buffers['EEG']['AF8'],
        data_buffers['EEG']['TP10']
    )

    current_metrics['emotion'] = emotion
    current_metrics['valence'] = float(valence)
    current_metrics['arousal'] = float(arousal)
    current_metrics['emotion_confidence'] = float(confidence)

def update_all_metrics():
    """Update focus/attention classification in real-time"""
    global current_metrics

    # Update attention/focus classification
    attention, focus_score, distraction_score, confidence = attention_classifier.classify_attention(
        data_buffers['EEG']['TP9'],
        data_buffers['EEG']['AF7'],
        data_buffers['EEG']['AF8'],
        data_buffers['EEG']['TP10']
    )
    current_metrics['attention'] = attention
    current_metrics['focus_score'] = float(focus_score)
    current_metrics['distraction_score'] = float(distraction_score)
    current_metrics['attention_confidence'] = float(confidence)

def classify_emotion_state():
    """Legacy - now called by update_all_metrics"""
    pass

def classify_attention_state():
    """Legacy - now called by update_all_metrics"""
    pass

def narrate_insights():
    """Create and speak insights based on all sensor data"""
    global last_narration_time

    current_time = time.time()
    if current_time - last_narration_time < narration_interval:
        return

    try:
        analyze_eeg()
        hr = calculate_heart_rate()
        current_metrics['heart_rate'] = hr

        narration = "System report. "

        # Attention
        attention = current_metrics['attention']
        if attention != 'unknown':
            narration += f"Focus level is {attention}. "

        # Brain state
        narration += f"Brain state is {current_metrics['brain_state']}. "

        # Heart rate
        if hr > 0:
            narration += f"Estimated heart rate {int(hr)} beats per minute. "

        # Head orientation
        if current_metrics['head_orientation'] == 'left':
            narration += "You are facing left. "
        elif current_metrics['head_orientation'] == 'right':
            narration += "You are facing right. "
        else:
            narration += "You are facing forward. "

        # Movement
        if current_metrics['movement_intensity'] > 1.5:
            narration += "High movement detected. "
        elif current_metrics['movement_intensity'] > 0.5:
            narration += "Moderate movement detected. "

        print(f"Narration: {narration}")
        # TTS disabled
        # tts_engine.say(narration)
        # tts_engine.runAndWait()

        last_narration_time = current_time
    except Exception as e:
        print(f"Error in narration: {e}")

def stream_eeg():
    """Stream EEG data using pull_chunk (proper muse-lsl method)"""
    global last_classification_time
    if 'EEG' not in inlets:
        return

    start_time = time.time()
    sample_count = 0

    while streaming:
        try:
            # Pull chunk of data (more efficient than pull_sample)
            chunk, timestamps = inlets['EEG'].pull_chunk(timeout=1.0, max_samples=LSL_EEG_CHUNK)

            if timestamps:
                elapsed = time.time() - start_time

                # Process each sample in the chunk
                for i, sample in enumerate(chunk):
                    # EEG has 5 channels: TP9, AF7, AF8, TP10, Right AUX
                    data_buffers['EEG']['TP9'].append(sample[0])
                    data_buffers['EEG']['AF7'].append(sample[1])
                    data_buffers['EEG']['AF8'].append(sample[2])
                    data_buffers['EEG']['TP10'].append(sample[3])
                    if len(sample) > 4:
                        data_buffers['EEG']['AUX'].append(sample[4])
                    data_buffers['EEG']['timestamp'].append(timestamps[i])

                    sample_count += 1

                # Update classifications in real-time (every ~100ms)
                current_time = time.time()
                if current_time - last_classification_time > classification_interval:
                    if len(data_buffers['EEG']['TP9']) > 100:
                        update_all_metrics()

                        # Send metrics to Tauri frontend
                        send_to_tauri()

                        # Record to timeline every 500ms
                        if len(data_buffers['EEG']['timestamp']) > 0 and sample_count % 128 == 0:
                            latest_time = data_buffers['EEG']['timestamp'][-1]
                            data_buffers['METRICS']['focus_score'].append(current_metrics['focus_score'])
                            data_buffers['METRICS']['attention_state'].append(current_metrics['attention'])
                            data_buffers['METRICS']['timestamp'].append(latest_time)

                    last_classification_time = current_time

                narrate_insights()
        except Exception as e:
            print(f"EEG error: {e}")
            time.sleep(0.01)

def stream_ppg():
    """Stream PPG (heart rate) data using pull_chunk"""
    if 'PPG' not in inlets:
        return

    while streaming:
        try:
            # Pull chunk of PPG data
            chunk, timestamps = inlets['PPG'].pull_chunk(timeout=1.0, max_samples=LSL_PPG_CHUNK)

            if timestamps:
                for i, sample in enumerate(chunk):
                    # PPG has 3 channels
                    data_buffers['PPG']['PPG1'].append(sample[0])
                    if len(sample) > 1:
                        data_buffers['PPG']['PPG2'].append(sample[1])
                    if len(sample) > 2:
                        data_buffers['PPG']['PPG3'].append(sample[2])
                    data_buffers['PPG']['timestamp'].append(timestamps[i])
        except Exception as e:
            print(f"PPG error: {e}")
            time.sleep(0.01)

def stream_acc():
    """Stream accelerometer data using pull_chunk"""
    if 'ACC' not in inlets:
        return

    while streaming:
        try:
            chunk, timestamps = inlets['ACC'].pull_chunk(timeout=1.0, max_samples=LSL_ACC_CHUNK)

            if timestamps:
                for i, sample in enumerate(chunk):
                    data_buffers['ACC']['X'].append(sample[0])
                    data_buffers['ACC']['Y'].append(sample[1])
                    data_buffers['ACC']['Z'].append(sample[2])
                    data_buffers['ACC']['timestamp'].append(timestamps[i])
                detect_head_orientation()
        except Exception as e:
            print(f"ACC error: {e}")
            time.sleep(0.01)

def stream_gyro():
    """Stream gyroscope data using pull_chunk"""
    if 'GYRO' not in inlets:
        return

    while streaming:
        try:
            chunk, timestamps = inlets['GYRO'].pull_chunk(timeout=1.0, max_samples=LSL_GYRO_CHUNK)

            if timestamps:
                for i, sample in enumerate(chunk):
                    data_buffers['GYRO']['X'].append(sample[0])
                    data_buffers['GYRO']['Y'].append(sample[1])
                    data_buffers['GYRO']['Z'].append(sample[2])
                    data_buffers['GYRO']['timestamp'].append(timestamps[i])
        except Exception as e:
            print(f"GYRO error: {e}")
            time.sleep(0.01)

def get_eeg_plot():
    """Generate EEG plot"""
    if not data_buffers['EEG']['timestamp']:
        return None

    timestamps = list(data_buffers['EEG']['timestamp'])

    fig = make_subplots(
        rows=2, cols=2,
        subplot_titles=('TP9 (Left Ear)', 'AF7 (Left)', 'AF8 (Right)', 'TP10 (Right Ear)'),
        specs=[[{}, {}], [{}, {}]],
        vertical_spacing=0.12
    )

    channels = [
        (list(data_buffers['EEG']['TP9']), 'TP9', 1, 1, '#FF6B6B'),
        (list(data_buffers['EEG']['AF7']), 'AF7', 1, 2, '#4ECDC4'),
        (list(data_buffers['EEG']['AF8']), 'AF8', 2, 1, '#45B7D1'),
        (list(data_buffers['EEG']['TP10']), 'TP10', 2, 2, '#FFA07A')
    ]

    for data, name, row, col, color in channels:
        fig.add_trace(
            go.Scatter(
                x=timestamps, y=data, mode='lines', name=name,
                line=dict(color=color, width=2),
                hovertemplate=f'<b>{name}</b><br>Time: %{{x:.2f}}s<br>Amplitude: %{{y:.2f}}µV<extra></extra>'
            ),
            row=row, col=col
        )

    fig.update_layout(height=700, title_text="EEG Data (4 Channels)",
                     hovermode='x unified', template='plotly_dark')
    return json.dumps(fig, cls=plotly.utils.PlotlyJSONEncoder)

def get_motion_plot():
    """Generate accelerometer and gyroscope plot"""
    if not data_buffers['ACC']['timestamp']:
        return None

    timestamps_acc = list(data_buffers['ACC']['timestamp'])

    fig = make_subplots(
        rows=1, cols=2,
        subplot_titles=('Accelerometer (G)', 'Gyroscope (°/s)'),
        specs=[[{}, {}]]
    )

    # Accelerometer
    for axis, color in [('X', '#FF6B6B'), ('Y', '#4ECDC4'), ('Z', '#45B7D1')]:
        fig.add_trace(
            go.Scatter(
                x=timestamps_acc, y=list(data_buffers['ACC'][axis]),
                mode='lines', name=f'ACC {axis}',
                line=dict(color=color, width=2)
            ),
            row=1, col=1
        )

    # Gyroscope
    if data_buffers['GYRO']['timestamp']:
        timestamps_gyro = list(data_buffers['GYRO']['timestamp'])
        for axis, color in [('X', '#FF6B6B'), ('Y', '#4ECDC4'), ('Z', '#45B7D1')]:
            fig.add_trace(
                go.Scatter(
                    x=timestamps_gyro, y=list(data_buffers['GYRO'][axis]),
                    mode='lines', name=f'GYRO {axis}',
                    line=dict(color=color, width=2, dash='dash')
                ),
                row=1, col=2
            )

    fig.update_layout(height=400, title_text="Motion Sensors",
                     hovermode='x unified', template='plotly_dark')
    return json.dumps(fig, cls=plotly.utils.PlotlyJSONEncoder)

def get_ppg_plot():
    """Generate PPG plot"""
    if not data_buffers['PPG']['timestamp']:
        return None

    timestamps = list(data_buffers['PPG']['timestamp'])

    fig = go.Figure()
    fig.add_trace(go.Scatter(
        x=timestamps, y=list(data_buffers['PPG']['PPG']),
        mode='lines', name='PPG',
        line=dict(color='#FF1493', width=2),
        fill='tozeroy'
    ))

    fig.update_layout(
        height=300, title_text=f"PPG (Heart Rate Signal) - Est. HR: {int(current_metrics['heart_rate'])} bpm",
        hovermode='x unified', template='plotly_dark'
    )
    return json.dumps(fig, cls=plotly.utils.PlotlyJSONEncoder)

def get_focus_timeline_plot():
    """Generate focus timeline plot"""
    if not data_buffers['METRICS']['timestamp']:
        return None

    timestamps = list(data_buffers['METRICS']['timestamp'])
    focus_scores = list(data_buffers['METRICS']['focus_score'])

    fig = go.Figure()

    # Focus score line
    fig.add_trace(go.Scatter(
        x=timestamps, y=focus_scores,
        mode='lines', name='Focus Score',
        line=dict(color='#00FF00', width=3),
        fill='tozeroy',
        fillcolor='rgba(0, 255, 0, 0.2)'
    ))

    # Add threshold bands
    fig.add_hline(y=0.65, line_dash="dash", line_color="green", annotation_text="Focused threshold")
    fig.add_hline(y=0.35, line_dash="dash", line_color="red", annotation_text="Drowsy threshold")

    fig.update_layout(
        height=300, title_text="Focus Timeline (0-1 Scale)",
        hovermode='x unified', template='plotly_dark',
        yaxis_range=[0, 1]
    )
    return json.dumps(fig, cls=plotly.utils.PlotlyJSONEncoder)

HTML_TEMPLATE = '''
<!DOCTYPE html>
<html>
<head>
    <title>Muse 2 Full System Monitor</title>
    <script src="https://cdn.plot.ly/plotly-latest.min.js"></script>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
            color: #fff;
            padding: 20px;
        }
        .container { max-width: 1600px; margin: 0 auto; }
        h1 { text-align: center; color: #00ff88; margin-bottom: 20px; font-size: 28px; }

        .status-bar {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 15px;
            margin-bottom: 20px;
        }
        .status-card {
            background: rgba(0, 255, 136, 0.1);
            border: 2px solid #00ff88;
            border-radius: 8px;
            padding: 15px;
            text-align: center;
        }
        .status-card h3 { color: #00ff88; font-size: 12px; text-transform: uppercase; margin-bottom: 8px; }
        .status-card .value { font-size: 24px; font-weight: bold; color: #fff; }

        .status-card.head-left { border-color: #FF6B6B; }
        .status-card.head-right { border-color: #45B7D1; }
        .status-card.head-center { border-color: #4ECDC4; }

        .plots-container {
            display: grid;
            grid-template-columns: 1fr;
            gap: 20px;
            margin-bottom: 20px;
        }

        .plot-section {
            background: rgba(0, 0, 0, 0.3);
            border-radius: 8px;
            padding: 15px;
            border: 1px solid #333;
        }

        .plot-section h2 {
            color: #00ff88;
            margin-bottom: 10px;
            font-size: 16px;
        }

        #eeg-plot, #motion-plot, #ppg-plot {
            width: 100%;
        }

        .controls {
            text-align: center;
            margin-bottom: 20px;
        }

        button {
            padding: 10px 20px;
            margin: 0 5px;
            font-size: 14px;
            background-color: #00ff88;
            color: #1a1a2e;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-weight: bold;
            transition: all 0.3s;
        }

        button:hover {
            background-color: #00dd77;
            transform: scale(1.05);
        }

        .info {
            text-align: center;
            color: #aaa;
            font-size: 12px;
            margin-top: 20px;
        }

        .emoji { font-size: 20px; margin-right: 5px; }
    </style>
</head>
<body>
    <div class="container">
        <h1><span class="emoji">🧠</span>Muse 2 Full System Monitor</h1>

        <div class="status-bar">
            <div class="status-card" id="attention-card">
                <h3>Focus Level</h3>
                <div class="value" id="attention">Analyzing...</div>
            </div>
            <div class="status-card">
                <h3>Brain State</h3>
                <div class="value" id="brain-state">Initializing...</div>
            </div>
            <div class="status-card" id="orientation-card">
                <h3>Head Orientation</h3>
                <div class="value" id="head-orientation">Detecting...</div>
            </div>
            <div class="status-card">
                <h3>Heart Rate</h3>
                <div class="value" id="heart-rate">-- bpm</div>
            </div>
            <div class="status-card">
                <h3>Movement</h3>
                <div class="value" id="movement">Low</div>
            </div>
        </div>

        <div class="controls">
            <button onclick="toggleUpdate()">Pause</button>
            <button onclick="clearData()">Clear Data</button>
            <button onclick="window.location.href='/typing-test'" style="background: #00ff00; color: #000; font-weight: bold;">📝 Focus Calibration Test</button>
        </div>

        <div class="plots-container">
            <div class="plot-section">
                <h2>EEG Signals (256 Hz)</h2>
                <div id="eeg-plot"></div>
            </div>

            <div class="plot-section">
                <h2>Motion Sensors</h2>
                <div id="motion-plot"></div>
            </div>

            <div class="plot-section">
                <h2>PPG / Heart Rate Signal (64 Hz)</h2>
                <div id="ppg-plot"></div>
            </div>

            <div class="plot-section">
                <h2>Focus Timeline</h2>
                <div id="focus-timeline"></div>
            </div>
        </div>

        <div class="info">
            <p>Real-time monitoring from Muse 2 | EEG (256Hz) + PPG (64Hz) + Motion (52Hz) | Auto-updating every 200ms</p>
        </div>
    </div>

    <script>
        let autoUpdate = true;
        const updateInterval = 200;

        async function updateAllPlots() {
            if (!autoUpdate) return;

            try {
                // Update metrics
                const response = await fetch('/metrics');
                const metrics = await response.json();

                // Attention card color based on focus
                const attentionText = metrics.attention !== 'unknown' ?
                    `${metrics.attention} (${(metrics.focus_score * 100).toFixed(0)}%)` :
                    'Analyzing...';
                document.getElementById('attention').textContent = attentionText;

                const attentionCard = document.getElementById('attention-card');
                const attentionColors = {
                    'focused': '#00FF00',
                    'neutral': '#FFFF00',
                    'distracted': '#FFA500',
                    'drowsy': '#FF0000'
                };
                const attentionColor = attentionColors[metrics.attention] || '#808080';
                attentionCard.style.borderColor = attentionColor;
                attentionCard.style.background = `rgba(${parseInt(attentionColor.slice(1,3),16)}, ${parseInt(attentionColor.slice(3,5),16)}, ${parseInt(attentionColor.slice(5,7),16)}, 0.1)`;

                document.getElementById('brain-state').textContent = metrics.brain_state;
                document.getElementById('head-orientation').textContent = metrics.head_orientation;
                document.getElementById('heart-rate').textContent = `${Math.round(metrics.heart_rate)} bpm`;
                document.getElementById('movement').textContent =
                    metrics.movement_intensity > 1.5 ? 'High' :
                    metrics.movement_intensity > 0.5 ? 'Moderate' : 'Low';

                const card = document.getElementById('orientation-card');
                card.className = 'status-card head-' + metrics.head_orientation;

                // Update plots
                const eegResp = await fetch('/plot/eeg');
                if (eegResp.ok) {
                    const eegData = await eegResp.json();
                    Plotly.newPlot('eeg-plot', eegData.data, eegData.layout, {responsive: true});
                }

                const motionResp = await fetch('/plot/motion');
                if (motionResp.ok) {
                    const motionData = await motionResp.json();
                    Plotly.newPlot('motion-plot', motionData.data, motionData.layout, {responsive: true});
                }

                const ppgResp = await fetch('/plot/ppg');
                if (ppgResp.ok) {
                    const ppgData = await ppgResp.json();
                    Plotly.newPlot('ppg-plot', ppgData.data, ppgData.layout, {responsive: true});
                }

                const focusResp = await fetch('/plot/focus-timeline');
                if (focusResp.ok) {
                    const focusData = await focusResp.json();
                    Plotly.newPlot('focus-timeline', focusData.data, focusData.layout, {responsive: true});
                }
            } catch (e) {
                console.error('Update error:', e);
            }
        }

        function toggleUpdate() {
            autoUpdate = !autoUpdate;
            event.target.textContent = autoUpdate ? 'Pause' : 'Resume';
            if (autoUpdate) updateAllPlots();
        }

        function clearData() {
            fetch('/clear', {method: 'POST'}).then(() => updateAllPlots());
        }

        updateAllPlots();
        setInterval(updateAllPlots, updateInterval);
    </script>
</body>
</html>
'''

@app.route('/')
def index():
    return render_template_string(HTML_TEMPLATE)

@app.route('/metrics')
def metrics():
    return jsonify(current_metrics)

@app.route('/calibrate', methods=['POST'])
def calibrate():
    """Calibrate baseline for this user (call after 30s of focused work)"""
    global attention_classifier
    if current_metrics['attention'] == 'unknown':
        return {'error': 'Not enough data yet'}, 400

    attention_classifier.baseline_theta_beta = current_metrics['focus_score']
    attention_classifier.baseline_std = 0.1  # Standard deviation

    return {
        'status': 'calibrated',
        'baseline': current_metrics['focus_score'],
        'message': f'Baseline set to {current_metrics["focus_score"]:.2f}. This is your "focused" state.'
    }

@app.route('/typing-test')
def typing_test():
    """MonkeyType-style typing test for focus calibration"""
    test_words = [
        "the quick brown fox jumps over the lazy dog",
        "artificial intelligence is revolutionizing technology",
        "focus and concentration lead to excellence",
        "neural networks process information faster",
        "meditation builds mental discipline",
        "your brain adapts through repetition",
        "sleep deprivation ruins concentration",
        "coffee improves alertness temporarily",
        "exercise enhances cognitive function",
        "reading expands your vocabulary"
    ]

    html = """
    <!DOCTYPE html>
    <html>
    <head>
        <title>Focus Calibration - Typing Test</title>
        <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body {
                font-family: 'Monaco', 'Courier New', monospace;
                background: #1a1a1a;
                color: #fff;
                padding: 40px;
                display: flex;
                justify-content: center;
                align-items: center;
                min-height: 100vh;
            }
            .container {
                max-width: 800px;
                width: 100%;
                background: #2a2a2a;
                border-radius: 8px;
                padding: 40px;
                box-shadow: 0 0 20px rgba(0,0,0,0.5);
            }
            h1 {
                text-align: center;
                margin-bottom: 30px;
                color: #00ff00;
            }
            .instructions {
                background: #333;
                padding: 15px;
                border-radius: 5px;
                margin-bottom: 20px;
                font-size: 14px;
                color: #aaa;
            }
            .typing-area {
                display: flex;
                flex-direction: column;
                gap: 20px;
            }
            .text-display {
                background: #1a1a1a;
                padding: 20px;
                border-radius: 5px;
                border: 2px solid #444;
                line-height: 1.8;
                font-size: 18px;
                min-height: 100px;
                white-space: pre-wrap;
                word-wrap: break-word;
            }
            .text-display .correct {
                color: #00ff00;
            }
            .text-display .incorrect {
                color: #ff0000;
                background: rgba(255,0,0,0.2);
            }
            .text-display .current {
                background: #ffff00;
                color: #000;
            }
            .input-box {
                background: #1a1a1a;
                border: 2px solid #00ff00;
                padding: 15px;
                border-radius: 5px;
                font-size: 16px;
                color: #00ff00;
                font-family: 'Monaco', 'Courier New', monospace;
            }
            .input-box:focus {
                outline: none;
                border-color: #00ff80;
                box-shadow: 0 0 10px rgba(0,255,0,0.3);
            }
            .stats {
                display: grid;
                grid-template-columns: 1fr 1fr 1fr 1fr;
                gap: 10px;
                margin-top: 20px;
            }
            .stat {
                background: #333;
                padding: 15px;
                border-radius: 5px;
                text-align: center;
            }
            .stat-value {
                font-size: 24px;
                color: #00ff00;
                font-weight: bold;
            }
            .stat-label {
                font-size: 12px;
                color: #888;
                margin-top: 5px;
            }
            .brain-metrics {
                background: #333;
                padding: 15px;
                border-radius: 5px;
                margin-top: 20px;
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 10px;
            }
            .metric {
                display: flex;
                justify-content: space-between;
                font-size: 14px;
            }
            .metric-value {
                color: #00ff00;
                font-weight: bold;
            }
            .button-group {
                display: flex;
                gap: 10px;
                margin-top: 20px;
            }
            button {
                flex: 1;
                padding: 12px;
                background: #00ff00;
                color: #000;
                border: none;
                border-radius: 5px;
                font-weight: bold;
                cursor: pointer;
                font-size: 14px;
            }
            button:hover {
                background: #00ff80;
            }
            button:disabled {
                background: #666;
                color: #ccc;
                cursor: not-allowed;
            }
            .completed {
                background: #003300;
                border: 2px solid #00ff00;
                padding: 20px;
                text-align: center;
                border-radius: 5px;
                display: none;
            }
            .completed h2 {
                color: #00ff00;
                margin-bottom: 10px;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>🧠 Focus Calibration Test</h1>

            <div class="instructions">
                <strong>How it works:</strong> Type the text as fast and accurately as you can. Your brain activity will be recorded during this focused task to establish your "focused baseline" for attention detection.
            </div>

            <div id="test-container" class="typing-area">
                <div class="text-display" id="text-display">Waiting to start...</div>
                <input type="text" class="input-box" id="user-input" placeholder="Click here and start typing..." disabled>

                <div class="stats">
                    <div class="stat">
                        <div class="stat-value" id="wpm">0</div>
                        <div class="stat-label">WPM</div>
                    </div>
                    <div class="stat">
                        <div class="stat-value" id="accuracy">100%</div>
                        <div class="stat-label">Accuracy</div>
                    </div>
                    <div class="stat">
                        <div class="stat-value" id="time">60s</div>
                        <div class="stat-label">Time Left</div>
                    </div>
                    <div class="stat">
                        <div class="stat-value" id="status">Ready</div>
                        <div class="stat-label">Status</div>
                    </div>
                </div>

                <div class="brain-metrics" id="brain-metrics" style="display: none;">
                    <div class="metric">
                        <span>Focus Level:</span>
                        <span class="metric-value" id="focus-level">--</span>
                    </div>
                    <div class="metric">
                        <span>Brain State:</span>
                        <span class="metric-value" id="brain-state-metric">--</span>
                    </div>
                    <div class="metric">
                        <span>θ/β Ratio:</span>
                        <span class="metric-value" id="theta-beta-ratio">--</span>
                    </div>
                    <div class="metric">
                        <span>Confidence:</span>
                        <span class="metric-value" id="confidence-metric">--</span>
                    </div>
                </div>

                <div class="button-group">
                    <button onclick="startTest()">Start Test (60 seconds)</button>
                    <button onclick="window.location.href='/'">Back to Dashboard</button>
                </div>
            </div>

            <div class="completed" id="completed">
                <h2>✅ Test Complete!</h2>
                <p id="completed-message"></p>
                <div class="button-group">
                    <button onclick="useFocusBaseline()">Use Measured Focus as Baseline</button>
                    <button onclick="location.reload()">Try Again</button>
                </div>
            </div>
        </div>

        <script>
            let testText = `""" + test_words[int(time.time()) % len(test_words)] + """`;
            let timeLeft = 60;
            let testRunning = false;
            let testData = [];
            let focusScores = [];

            async function fetchMetrics() {
                try {
                    const response = await fetch('/metrics');
                    return await response.json();
                } catch (e) {
                    return null;
                }
            }

            async function recordMetrics() {
                if (!testRunning) return;

                const metrics = await fetchMetrics();
                if (metrics) {
                    testData.push({
                        time: 60 - timeLeft,
                        ...metrics
                    });
                    focusScores.push(metrics.focus_score);

                    // Update brain metrics display
                    document.getElementById('focus-level').textContent =
                        metrics.attention + ' (' + (metrics.focus_score * 100).toFixed(0) + '%)';
                    document.getElementById('brain-state-metric').textContent = metrics.brain_state;
                    document.getElementById('theta-beta-ratio').textContent = metrics.theta_beta_ratio.toFixed(3);
                    document.getElementById('confidence-metric').textContent =
                        (metrics.confidence * 100).toFixed(0) + '%';
                }
            }

            function startTest() {
                testRunning = true;
                timeLeft = 60;
                testData = [];
                focusScores = [];

                document.getElementById('text-display').textContent = testText;
                document.getElementById('user-input').disabled = false;
                document.getElementById('user-input').focus();
                document.getElementById('user-input').value = '';
                document.querySelector('button').disabled = true;
                document.getElementById('brain-metrics').style.display = 'grid';

                // Record metrics every 500ms
                const metricsInterval = setInterval(recordMetrics, 500);

                // Update UI every 100ms
                const updateInterval = setInterval(() => {
                    updateDisplay();
                    if (timeLeft <= 0) {
                        clearInterval(metricsInterval);
                        clearInterval(updateInterval);
                        endTest();
                    }
                }, 100);

                // Countdown
                const countdownInterval = setInterval(() => {
                    timeLeft--;
                    document.getElementById('time').textContent = timeLeft + 's';
                    if (timeLeft <= 0) {
                        clearInterval(countdownInterval);
                    }
                }, 1000);
            }

            function updateDisplay() {
                const input = document.getElementById('user-input').value;
                let display = '';
                let correct = 0;
                let total = Math.max(input.length, 1);

                for (let i = 0; i < testText.length; i++) {
                    if (i < input.length) {
                        if (input[i] === testText[i]) {
                            display += '<span class="correct">' + testText[i] + '</span>';
                            correct++;
                        } else {
                            display += '<span class="incorrect">' + testText[i] + '</span>';
                        }
                    } else if (i === input.length) {
                        display += '<span class="current">' + testText[i] + '</span>';
                    } else {
                        display += testText[i];
                    }
                }

                document.getElementById('text-display').innerHTML = display;

                const accuracy = input.length > 0 ? Math.round((correct / input.length) * 100) : 100;
                document.getElementById('accuracy').textContent = accuracy + '%';

                const elapsed = 60 - timeLeft;
                const wpm = elapsed > 0 ? Math.round((input.length / 5) / (elapsed / 60)) : 0;
                document.getElementById('wpm').textContent = wpm;
            }

            function endTest() {
                testRunning = false;
                document.getElementById('user-input').disabled = true;
                document.getElementById('status').textContent = 'Complete';

                const avgFocus = focusScores.length > 0 ?
                    focusScores.reduce((a, b) => a + b) / focusScores.length : 0;

                document.getElementById('test-container').style.display = 'none';
                document.getElementById('completed').style.display = 'block';
                document.getElementById('completed-message').textContent =
                    'Average Focus During Test: ' + (avgFocus * 100).toFixed(1) + '%\\n' +
                    'This will be your new focused baseline.';

                window.testFocusScore = avgFocus;
            }

            async function useFocusBaseline() {
                if (window.testFocusScore === undefined) return;

                try {
                    const response = await fetch('/calibrate-with-score', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ focus_score: window.testFocusScore })
                    });
                    const data = await response.json();
                    alert('Baseline calibrated! ' + data.message);
                    window.location.href = '/';
                } catch (e) {
                    alert('Error setting baseline: ' + e.message);
                }
            }
        </script>
    </body>
    </html>
    """

    return render_template_string(html)

@app.route('/calibrate-with-score', methods=['POST'])
def calibrate_with_score():
    """Calibrate with a specific focus score (from typing test)"""
    global attention_classifier

    try:
        data = request.get_json()
        focus_score = data.get('focus_score', 0)

        if not (0 <= focus_score <= 1):
            return {'error': 'Invalid focus score'}, 400

        attention_classifier.baseline_theta_beta = focus_score
        attention_classifier.baseline_std = 0.08

        return {
            'status': 'calibrated',
            'baseline': focus_score,
            'message': f'Focus baseline calibrated to {focus_score:.2f} from typing test. Your focused state is now personalized.'
        }
    except Exception as e:
        return {'error': str(e)}, 400

@app.route('/plot/eeg')
def plot_eeg():
    data = get_eeg_plot()
    return data if data else jsonify({'data': [], 'layout': {}})

@app.route('/plot/motion')
def plot_motion():
    data = get_motion_plot()
    return data if data else jsonify({'data': [], 'layout': {}})

@app.route('/plot/ppg')
def plot_ppg():
    data = get_ppg_plot()
    return data if data else jsonify({'data': [], 'layout': {}})

@app.route('/plot/focus-timeline')
def plot_focus_timeline():
    data = get_focus_timeline_plot()
    return data if data else jsonify({'data': [], 'layout': {}})

@app.route('/clear', methods=['POST'])
def clear():
    for buf_type in data_buffers.values():
        for key in buf_type:
            buf_type[key].clear()
    return {'status': 'cleared'}

def find_available_port():
    """Find an available port from the range"""
    import socket
    PORT_RANGE = range(5000, 5006)
    for port in PORT_RANGE:
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                s.bind(('127.0.0.1', port))
                return port
        except OSError:
            continue
    raise RuntimeError("No available ports in range 5000-5005")

def start_server():
    port = find_available_port()
    print("\n" + "="*70)
    print("  🧠  MUSE 2 FULL SYSTEM MONITOR")
    print("="*70)
    print(f"🌐 Local access:    http://localhost:{port}")
    import socket
    try:
        hostname = socket.gethostname()
        local_ip = socket.gethostbyname(hostname)
        if local_ip != '127.0.0.1':
            print(f"🌐 Network access:  http://{local_ip}:{port}")
    except:
        pass
    print("📊 Monitoring: EEG + PPG + Accelerometer + Gyroscope")
    print("="*70 + "\n")
    app.run(debug=False, use_reloader=False, host='0.0.0.0', port=port, threaded=True)

if __name__ == '__main__':
    streaming = True

    if not connect_to_streams():
        print("Warning: Could not connect to all streams. Continuing anyway...")

    # Start streaming threads
    threads = [
        ('EEG', stream_eeg),
        ('PPG', stream_ppg),
        ('ACC', stream_acc),
        ('GYRO', stream_gyro)
    ]

    for name, func in threads:
        t = threading.Thread(target=func, daemon=True, name=name)
        t.start()
        stream_threads[name] = t

    time.sleep(1)
    start_server()
