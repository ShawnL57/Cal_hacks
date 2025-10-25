#!/usr/bin/env python3
"""
Integrated Backend - Muse Attention + Duck Controller
"""
import os
import threading
import time
from collections import deque
from flask import Flask, jsonify, request, render_template_string
from flask_cors import CORS
from pylsl import StreamInlet, resolve_streams
import plotly
import plotly.graph_objects as go
import plotly.utils
from plotly.subplots import make_subplots
import json
import numpy as np
from attention_classifier import AttentionClassifier

os.environ['DYLD_LIBRARY_PATH'] = '/opt/homebrew/lib'

app = Flask(__name__)
CORS(app)

attention_classifier = AttentionClassifier(sampling_rate=256)

data_buffers = {
    'EEG': {
        'TP9': deque(maxlen=2560),
        'AF7': deque(maxlen=2560),
        'AF8': deque(maxlen=2560),
        'TP10': deque(maxlen=2560),
        'timestamp': deque(maxlen=2560)
    },
    'PPG': {
        'PPG': deque(maxlen=64),
        'timestamp': deque(maxlen=64)
    },
    'ACC': {
        'X': deque(maxlen=256),
        'Y': deque(maxlen=256),
        'Z': deque(maxlen=256),
        'timestamp': deque(maxlen=256)
    },
    'GYRO': {
        'X': deque(maxlen=256),
        'Y': deque(maxlen=256),
        'Z': deque(maxlen=256),
        'timestamp': deque(maxlen=256)
    },
    'METRICS': {
        'focus_score': deque(maxlen=600),
        'attention_state': deque(maxlen=600),
        'timestamp': deque(maxlen=600)
    }
}

current_metrics = {
    'head_orientation': 'center',
    'heart_rate': 0,
    'brain_state': 'unknown',
    'movement_intensity': 0,
    'attention': 'unknown',
    'focus_score': 0.5,
    'distraction_score': 0.5,
    'attention_confidence': 0,
    'theta_beta_ratio': 0
}

streaming = False
stream_threads = {}
inlets = {}
last_classification_time = 0
classification_interval = 0.1

def connect_to_streams():
    global inlets
    print("Looking for Muse streams...")
    streams = resolve_streams()

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
    global current_metrics

    try:
        acc_x = np.array(list(data_buffers['ACC']['X']))[-50:]
        acc_y = np.array(list(data_buffers['ACC']['Y']))[-50:]
        acc_z = np.array(list(data_buffers['ACC']['Z']))[-50:]

        gyro_x = np.array(list(data_buffers['GYRO']['X']))[-50:]
        gyro_y = np.array(list(data_buffers['GYRO']['Y']))[-50:]
        gyro_z = np.array(list(data_buffers['GYRO']['Z']))[-50:]

        mean_acc_x = np.mean(acc_x)
        mean_gyro_z = np.mean(gyro_z)

        if mean_acc_x > 0.1 or mean_gyro_z > 5:
            current_metrics['head_orientation'] = 'right'
        elif mean_acc_x < -0.1 or mean_gyro_z < -5:
            current_metrics['head_orientation'] = 'left'
        else:
            current_metrics['head_orientation'] = 'center'

        acc_magnitude = float(np.sqrt(np.mean(acc_x)**2 + np.mean(acc_y)**2 + np.mean(acc_z)**2))
        gyro_magnitude = float(np.sqrt(np.mean(gyro_x)**2 + np.mean(gyro_y)**2 + np.mean(gyro_z)**2))

        acc_normalized = min(1.0, acc_magnitude / 10.0)
        gyro_normalized = min(1.0, gyro_magnitude / 245.0)
        current_metrics['movement_intensity'] = (acc_normalized + gyro_normalized) / 2.0

    except Exception as e:
        print(f"Error detecting orientation: {e}")

def calculate_heart_rate():
    if len(data_buffers['PPG']['PPG']) < 64:
        return 0

    try:
        ppg_data = np.array(list(data_buffers['PPG']['PPG']))
        std = np.std(ppg_data)
        if std > 0:
            estimated_hr = 60 + (std * 10)
            return min(200, max(40, estimated_hr))
        return 0
    except:
        return 0

def analyze_eeg():
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

def update_all_metrics():
    global current_metrics

    attention, focus_score, distraction_score, confidence = attention_classifier.classify_attention(
        data_buffers['EEG']['TP9'],
        data_buffers['EEG']['AF7'],
        data_buffers['EEG']['AF8'],
        data_buffers['EEG']['TP10']
    )

    _, tb_ratio = attention_classifier.calculate_focus_score(
        list(data_buffers['EEG']['TP9']) + list(data_buffers['EEG']['AF7']) +
        list(data_buffers['EEG']['AF8']) + list(data_buffers['EEG']['TP10'])
    )

    current_metrics['attention'] = attention
    current_metrics['focus_score'] = float(focus_score)
    current_metrics['distraction_score'] = float(distraction_score)
    current_metrics['attention_confidence'] = float(confidence)
    current_metrics['theta_beta_ratio'] = float(tb_ratio)

def stream_eeg():
    global last_classification_time
    if 'EEG' not in inlets:
        return

    start_time = time.time()
    sample_count = 0
    while streaming:
        try:
            sample, timestamp = inlets['EEG'].pull_sample(timeout=0.1)
            if sample:
                elapsed = time.time() - start_time
                data_buffers['EEG']['TP9'].append(sample[0])
                data_buffers['EEG']['AF7'].append(sample[1])
                data_buffers['EEG']['AF8'].append(sample[2])
                data_buffers['EEG']['TP10'].append(sample[3])
                data_buffers['EEG']['timestamp'].append(elapsed)

                sample_count += 1

                current_time = time.time()
                if current_time - last_classification_time > classification_interval:
                    if len(data_buffers['EEG']['TP9']) > 100:
                        update_all_metrics()

                        if len(data_buffers['EEG']['timestamp']) > 0 and sample_count % 128 == 0:
                            latest_time = data_buffers['EEG']['timestamp'][-1]
                            data_buffers['METRICS']['focus_score'].append(current_metrics['focus_score'])
                            data_buffers['METRICS']['attention_state'].append(current_metrics['attention'])
                            data_buffers['METRICS']['timestamp'].append(latest_time)

                    last_classification_time = current_time

                if sample_count % 256 == 0:
                    analyze_eeg()
                    hr = calculate_heart_rate()
                    current_metrics['heart_rate'] = hr

        except Exception as e:
            print(f"EEG error: {e}")
            time.sleep(0.01)

def stream_ppg():
    if 'PPG' not in inlets:
        return

    start_time = time.time()
    while streaming:
        try:
            sample, timestamp = inlets['PPG'].pull_sample(timeout=0.1)
            if sample:
                elapsed = time.time() - start_time
                data_buffers['PPG']['PPG'].append(sample[0])
                data_buffers['PPG']['timestamp'].append(elapsed)
        except Exception as e:
            print(f"PPG error: {e}")
            time.sleep(0.01)

def stream_acc():
    if 'ACC' not in inlets:
        return

    start_time = time.time()
    while streaming:
        try:
            sample, timestamp = inlets['ACC'].pull_sample(timeout=0.1)
            if sample:
                elapsed = time.time() - start_time
                data_buffers['ACC']['X'].append(sample[0])
                data_buffers['ACC']['Y'].append(sample[1])
                data_buffers['ACC']['Z'].append(sample[2])
                data_buffers['ACC']['timestamp'].append(elapsed)
                detect_head_orientation()
        except Exception as e:
            print(f"ACC error: {e}")
            time.sleep(0.01)

def stream_gyro():
    if 'GYRO' not in inlets:
        return

    start_time = time.time()
    while streaming:
        try:
            sample, timestamp = inlets['GYRO'].pull_sample(timeout=0.1)
            if sample:
                elapsed = time.time() - start_time
                data_buffers['GYRO']['X'].append(sample[0])
                data_buffers['GYRO']['Y'].append(sample[1])
                data_buffers['GYRO']['Z'].append(sample[2])
                data_buffers['GYRO']['timestamp'].append(elapsed)
        except Exception as e:
            print(f"GYRO error: {e}")
            time.sleep(0.01)

@app.route('/health', methods=['GET'])
def health():
    return jsonify({
        "status": "running",
        "streaming": streaming,
        "timestamp": time.time()
    }), 200

@app.route('/api/metrics', methods=['GET'])
def metrics():
    return jsonify(current_metrics)

@app.route('/api/calibrate', methods=['POST'])
def calibrate():
    global attention_classifier
    if current_metrics['attention'] == 'unknown':
        return jsonify({'error': 'Not enough data yet'}), 400

    attention_classifier.baseline_theta_beta = current_metrics['focus_score']
    attention_classifier.baseline_std = 0.1

    return jsonify({
        'status': 'calibrated',
        'baseline': current_metrics['focus_score'],
        'message': f'Baseline set to {current_metrics["focus_score"]:.2f}. This is your "focused" state.'
    })

@app.route('/api/calibrate-with-score', methods=['POST'])
def calibrate_with_score():
    global attention_classifier

    try:
        data = request.get_json()
        focus_score = data.get('focus_score', 0)

        if not (0 <= focus_score <= 1):
            return jsonify({'error': 'Invalid focus score'}), 400

        attention_classifier.baseline_theta_beta = focus_score
        attention_classifier.baseline_std = 0.08

        return jsonify({
            'status': 'calibrated',
            'baseline': focus_score,
            'message': f'Focus baseline calibrated to {focus_score:.2f} from typing test.'
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@app.route('/api/clear', methods=['POST'])
def clear():
    for buf_type in data_buffers.values():
        for key in buf_type:
            buf_type[key].clear()
    return jsonify({'status': 'cleared'})

@app.route('/api/typing-words', methods=['GET'])
def typing_words():
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
    return jsonify({'words': test_words[int(time.time()) % len(test_words)]})

def start_server():
    print("\n" + "="*70)
    print("  🧠  MUSE 2 INTEGRATED BACKEND")
    print("="*70)
    print("🌐 Local access:    http://localhost:5001")
    print("📊 Monitoring: EEG + PPG + Accelerometer + Gyroscope")
    print("="*70 + "\n")
    app.run(debug=False, use_reloader=False, host='0.0.0.0', port=5001, threaded=True)

if __name__ == '__main__':
    streaming = True

    if not connect_to_streams():
        print("Warning: Could not connect to all streams. Continuing anyway...")

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
