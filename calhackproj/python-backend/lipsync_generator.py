#!/usr/bin/env python
"""
Duck Lip Sync Generator - maps phonemes to mouth shapes.
Works with audio files (wav/mp4/mp3) and outputs animation timeline.

Requires Gentle running: python gentle/serve.py
"""
import json
import sys
import subprocess
from pathlib import Path

def extract_audio_from_video(video_path):
    """Extract audio from video file to WAV"""
    audio_path = video_path.with_suffix('.wav')

    try:
        subprocess.run([
            'ffmpeg', '-i', str(video_path),
            '-vn', '-acodec', 'pcm_s16le',
            '-ar', '16000', '-ac', '1',
            str(audio_path)
        ], check=True, capture_output=True)
        print(f"🎵 Extracted audio to: {audio_path}")
        return audio_path
    except subprocess.CalledProcessError as e:
        print(f"❌ ffmpeg error: {e.stderr.decode()}")
        return None
    except FileNotFoundError:
        print("❌ ffmpeg not found. Install: brew install ffmpeg")
        return None

def get_phonemes_fast(audio_path):
    """Fast audio energy-based lip sync"""
    import wave
    import numpy as np

    print("⚡ Using fast mode (audio energy)")

    # Convert MP3 to WAV if needed
    audio_path = Path(audio_path)
    if audio_path.suffix.lower() != '.wav':
        print(f"🔄 Converting {audio_path.suffix} to WAV...")
        wav_path = audio_path.with_suffix('.wav')
        try:
            subprocess.run([
                'ffmpeg', '-i', str(audio_path),
                '-acodec', 'pcm_s16le', '-ar', '16000', '-ac', '1',
                str(wav_path), '-y'
            ], capture_output=True, check=True)
            audio_path = wav_path
        except FileNotFoundError:
            raise Exception("ffmpeg not found. Install: brew install ffmpeg")
        except subprocess.CalledProcessError as e:
            raise Exception(f"ffmpeg conversion failed: {e.stderr.decode()}")

    with wave.open(str(audio_path), 'r') as wav:
        fps = wav.getframerate()
        frames = wav.readframes(wav.getnframes())
        audio = np.frombuffer(frames, dtype=np.int16)

    # 30fps animation frames
    frame_size = fps // 30
    phonemes = []

    for i in range(0, len(audio), frame_size):
        chunk = audio[i:i+frame_size]
        energy = np.abs(chunk).mean()

        # More detailed energy-based viseme detection
        # Also check frequency content for better mapping
        if energy < 500:
            shape = 'closed'  # Very quiet = lips closed
        elif energy > 3000:
            shape = 'open'  # Very loud = mouth wide open
        elif energy > 2000:
            # Medium-high energy - check spectral characteristics
            high_freq = np.abs(chunk[::2]).mean()  # Rough high frequency estimate
            if high_freq > energy * 0.6:
                shape = 'teeth'  # High frequency content = sibilants
            else:
                shape = 'open'  # Lower frequency = vowels
        elif energy > 1000:
            # Medium energy
            high_freq = np.abs(chunk[::2]).mean()
            if high_freq > energy * 0.7:
                shape = 'teeth'  # Sharp sounds
            else:
                shape = 'pursed'  # Rounded vowels
        elif energy > 500:
            shape = 'closed'  # Low energy = consonants
        else:
            shape = 'neutral'

        phonemes.append({
            'phone': shape,
            'start': i / fps,
            'duration': frame_size / fps
        })

    return phonemes

def get_phonemes_pocketsphinx(audio_path):
    """Extract phonemes using pocketsphinx (fast and simple)"""
    try:
        from pocketsphinx import AudioFile, get_model_path
    except ImportError:
        print("⚠️  Install: pip install pocketsphinx")
        return get_phonemes_fast(audio_path)

    print("🎯 Using pocketsphinx")

    model_path = get_model_path()
    audio = AudioFile(
        audio_file=str(audio_path),
        hmm=f'{model_path}/en-us',
        allphone=f'{model_path}/en-us-phone.lm.bin',
        lw=2.0, pip=0.3, beam=1e-10, pbeam=1e-10
    )

    phonemes = []
    for seg in audio.seg():
        phone = seg.word.lower().replace('+', '').replace('_', '')
        phonemes.append({
            'phone': phone,
            'start': seg.start_frame / 100.0,
            'duration': (seg.end_frame - seg.start_frame) / 100.0
        })
    return phonemes

def map_to_visemes(phonemes, available_shapes):
    """Map phonemes to available mouth shapes: closed, neutral, open, pursed, teeth"""

    # Phoneme to shape mapping for: closed, neutral, open, pursed, teeth
    CLOSED = ['m', 'b', 'p']  # Lips pressed
    PURSED = ['w', 'uw', 'ow', 'ao', 'oy', 'u']  # Round/O shapes
    TEETH = ['s', 'z', 'th', 'dh', 'f', 'v', 'sh', 'zh']  # Teeth visible
    OPEN = ['aa', 'ah', 'ay', 'aw', 'ae']  # Wide open jaw
    # Everything else maps to neutral or closest match

    phone_map = {}
    shapes_lower = [s.lower() for s in available_shapes]
    default = 'neutral' if 'neutral' in shapes_lower else available_shapes[0]

    # Map each category to available shape
    for p in CLOSED:
        phone_map[p] = 'closed' if 'closed' in shapes_lower else default

    for p in PURSED:
        phone_map[p] = 'pursed' if 'pursed' in shapes_lower else default

    for p in TEETH:
        phone_map[p] = 'teeth' if 'teeth' in shapes_lower else default

    for p in OPEN:
        phone_map[p] = 'open' if 'open' in shapes_lower else default

    # Build timeline
    timeline = []
    for p in phonemes:
        phone = p['phone']
        # Check if phone is already a viseme name (from fast mode)
        if phone in shapes_lower:
            shape = phone
        else:
            shape = phone_map.get(phone, default)

        timeline.append({
            'shape': shape,
            'start': p['start'],
            'duration': p['duration']
        })

    return timeline
def generate_video(lipsync_data, assets_dir, output_path, audio_path):
    """Generate video from lip sync data"""
    from PIL import Image

    print("📂 Loading mouth shape images...")

    # Load mouth shape images
    shapes = {}
    for shape in lipsync_data['mouth_shapes']:
        img_path = assets_dir / f'{shape}.png'
        if img_path.exists():
            shapes[shape] = Image.open(img_path).convert('RGBA')
            print(f"  ✓ Loaded {shape}.png")

    if not shapes:
        raise Exception(f"No mouth shape images found in {assets_dir}")

    # Generate frames - use exact timing to never skip frames
    fps = lipsync_data['fps']
    duration = lipsync_data['duration']
    total_frames = int(duration * fps) + 1  # Add 1 to ensure we cover full duration

    frames = []
    frame_time = 1.0 / fps

    for frame_idx in range(total_frames):
        current_time = frame_idx * frame_time

        # Find which timeline item we're in
        current_shape = 'neutral'  # default
        for item in lipsync_data['timeline']:
            item_start = item['start']
            item_end = item['start'] + item['duration']
            if item_start <= current_time < item_end:
                current_shape = item['shape']
                break

        img = shapes.get(current_shape, list(shapes.values())[0])
        frames.append(img.copy())

    if not frames:
        print(f"❌ No frames generated from {len(lipsync_data['timeline'])} timeline items")
        print(f"   FPS: {fps}, Timeline sample: {lipsync_data['timeline'][:3]}")
        raise Exception("No frames generated - check timeline durations")

    print(f"🎞️  Generated {len(frames)} frames at {fps}fps = {len(frames)/fps:.2f}s")

    # Save frames to temporary directory
    import tempfile
    temp_dir = Path(tempfile.mkdtemp())
    for i, frame in enumerate(frames):
        frame.save(temp_dir / f'frame_{i:05d}.png')

    # Create video with ffmpeg - WebM with alpha channel
    print("🔊 Creating video with audio...")
    webm_output = output_path.with_suffix('.webm')
    result = subprocess.run([
        'ffmpeg',
        '-r', str(fps),
        '-i', str(temp_dir / 'frame_%05d.png'),
        '-i', str(audio_path),
        '-c:v', 'libvpx-vp9',
        '-c:a', 'libopus',
        '-pix_fmt', 'yuva420p',
        str(webm_output), '-y'
    ], capture_output=True, text=True)

    if result.returncode != 0:
        print(f"ffmpeg stderr: {result.stderr}")
        raise Exception(f"ffmpeg failed: {result.stderr}")

    # Cleanup
    import shutil
    shutil.rmtree(temp_dir)
    print(f"✅ Video saved: {webm_output}")

def generate_lipsync(audio_path, transcript, mouth_shapes, output_path=None, use_gentle=False):
    """
    Main function - generates lip sync animation data.

    Args:
        audio_path: Path to audio file (wav/mp4/mp3)
        transcript: What is being said
        mouth_shapes: List of mouth shape names you have rigged
        output_path: Where to save JSON (optional)
        use_gentle: Use Gentle for accurate phonemes (slow) vs fast audio energy

    Returns:
        Animation timeline dict
    """
    print(f"🎤 Audio: {audio_path}")
    print(f"📝 Transcript: '{transcript}'")
    print(f"👄 Available shapes: {mouth_shapes}")

    # Extract phonemes (use pocketsphinx by default, fallback to fast mode)
    try:
        phonemes = get_phonemes_pocketsphinx(audio_path)
        print(f"✅ Extracted {len(phonemes)} phonemes")
    except Exception as e:
        print(f"❌ Error: {e}")
        return None

    # Map to your mouth shapes
    timeline = map_to_visemes(phonemes, mouth_shapes)

    # Build output
    duration = timeline[-1]['start'] + timeline[-1]['duration'] if timeline else 0

    output = {
        'audio': str(audio_path),
        'duration': duration,
        'fps': 30,
        'mouth_shapes': mouth_shapes,
        'timeline': timeline
    }

    # Save if requested
    if output_path:
        with open(output_path, 'w') as f:
            json.dump(output, f, indent=2)
        print(f"💾 Saved to: {output_path}")

    # Print summary
    print(f"\n📊 Animation: {duration:.2f}s")
    shape_counts = {}
    for t in timeline:
        shape_counts[t['shape']] = shape_counts.get(t['shape'], 0) + 1

    print("👄 Shape usage:")
    for shape, count in sorted(shape_counts.items(), key=lambda x: -x[1]):
        print(f"   {shape:15} {count:3} frames")

    return output

# Example usage
if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("🦆 Duck Lip Sync Generator")
        print("\nUsage: python lipsync_generator.py <audio/video> [transcript] [shapes] [--gentle]")
        print("\nExamples:")
        print("  python lipsync_generator.py assets/video.mp4")
        print("  python lipsync_generator.py assets/audio.wav 'hello' closed,open")
        print("  python lipsync_generator.py assets/video.mp4 'text' --gentle  (slow but accurate)")
        sys.exit(1)

    input_file = Path(sys.argv[1])
    use_gentle = "--fast" not in sys.argv
    transcript = sys.argv[2] if len(sys.argv) > 2 and not sys.argv[2].startswith('--') else ""

    # Handle video files - extract audio first
    if input_file.suffix.lower() in ['.mp4', '.mov', '.avi', '.mkv']:
        print(f"📹 Video detected: {input_file}")
        audio_file = extract_audio_from_video(input_file)
        if not audio_file:
            sys.exit(1)
    else:
        audio_file = input_file

    if not audio_file.exists():
        print(f"❌ File not found: {audio_file}")
        sys.exit(1)

    # Get mouth shapes (auto-detect from assets folder or use provided)
    assets_dir = Path(__file__).parent / 'assets'

    if len(sys.argv) > 3:
        mouth_shapes = [s.strip() for s in sys.argv[3].split(',')]
    else:
        # Auto-detect from assets folder
        detected_shapes = []
        for shape in ['neutral', 'closed', 'open', 'pursed', 'teeth']:
            if (assets_dir / f'{shape}.png').exists():
                detected_shapes.append(shape)

        if detected_shapes:
            print(f"🔍 Auto-detected shapes: {', '.join(detected_shapes)}")
            mouth_shapes = detected_shapes
        else:
            print("👄 Enter mouth shapes (comma-separated):")
            print("   Available: neutral, closed, open, pursed, teeth")
            shapes_input = input("> ").strip()
            if not shapes_input:
                print("❌ No shapes provided")
                sys.exit(1)
            mouth_shapes = [s.strip() for s in shapes_input.split(',')]

    # Generate output path
    output_file = input_file.parent / (input_file.stem + '_lipsync.json')

    result = generate_lipsync(str(audio_file), transcript, mouth_shapes, str(output_file), use_gentle)
    if result:
        # Generate video automatically
        print("\n🎬 Generating video...")
        generate_video(result, assets_dir, input_file.parent / (input_file.stem + '_duck.webm'), audio_file)

