#!/usr/bin/env python3
"""
Screenshot Video Generator
Takes periodic screenshots, generates questions with Claude, creates TTS audio, and generates lip-sync videos
"""
import os
import time
import base64
import subprocess
from pathlib import Path
from datetime import datetime
from PIL import ImageGrab, Image
from anthropic import Anthropic
from dotenv import load_dotenv

# Load environment variables
load_dotenv()


class ScreenshotVideoGenerator:
    """Takes screenshots, generates questions, TTS audio, and lip-sync videos"""

    def __init__(self, interval=30):
        self.interval = interval
        self.screenshot_count = 0
        self.running = False

        # Setup directories
        self.screenshots_dir = Path(__file__).parent / "Screenshots"
        self.assets_dir = Path(__file__).parent / "assets"
        self.screenshots_dir.mkdir(exist_ok=True)
        self.assets_dir.mkdir(exist_ok=True)

        # Output paths
        self.latest_audio = self.assets_dir / "latest_question.mp3"
        self.latest_video = self.assets_dir / "latest_duck_video.webm"

        # Initialize Claude client
        api_key = os.getenv('ANTHROPIC_API_KEY')
        if api_key:
            self.claude_client = Anthropic(api_key=api_key)
        else:
            print("Warning: ANTHROPIC_API_KEY not found")
            self.claude_client = None

        # Fish Audio API key
        self.fish_api_key = os.getenv('FISH_AUDIO_API_KEY')
        if not self.fish_api_key:
            print("Warning: FISH_AUDIO_API_KEY not found")

        # Donald Duck voice reference ID
        self.voice_id = "c39a76f685cf4f8fb41cd5d3d66b497d"

        self.last_analysis = None
        self.last_screenshot_time = 0

    def analyze_screenshot_with_claude(self, image_path):
        """Send screenshot to Claude AI and get ONE question"""
        if not self.claude_client:
            return None

        prompt = """Analyze this screenshot. What's currently on the screen?
Generate ONE interesting question about the content to help the user re-engage with what they're looking at.
Just return the question, nothing else."""

        try:
            abs_image_path = os.path.abspath(image_path)

            with open(abs_image_path, "rb") as image_file:
                image_data = base64.standard_b64encode(image_file.read()).decode("utf-8")

            response = self.claude_client.messages.create(
                model="claude-3-5-haiku-20241022",
                max_tokens=256,
                temperature=0.7,
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "image",
                                "source": {
                                    "type": "base64",
                                    "media_type": "image/png",
                                    "data": image_data,
                                },
                            },
                            {
                                "type": "text",
                                "text": prompt
                            }
                        ],
                    }
                ],
            )

            question = response.content[0].text.strip()
            return question

        except Exception as e:
            print(f"Claude analysis error: {e}")
            return None

    def generate_audio_with_fish(self, text):
        """Generate TTS audio using Fish Audio API"""
        if not self.fish_api_key:
            print("Error: FISH_AUDIO_API_KEY not configured")
            return False

        try:
            from fish_audio_sdk import Session, TTSRequest

            session = Session(self.fish_api_key)

            print(f"Generating audio: {text[:50]}...")

            with open(self.latest_audio, "wb") as f:
                for chunk in session.tts(
                    TTSRequest(
                        text=text,
                        reference_id=self.voice_id
                    )
                ):
                    f.write(chunk)

            print(f"Audio saved: {self.latest_audio}")
            return True

        except Exception as e:
            print(f"Fish Audio TTS error: {e}")
            return False

    def generate_lipsync_video(self, audio_path, text):
        """Generate lip-sync video using lipsync_generator.py"""
        try:
            lipsync_script = Path(__file__).parent / "lipsync_generator.py"

            print("Generating lip-sync video...")

            result = subprocess.run([
                'python',
                str(lipsync_script),
                str(audio_path),
                text
            ], capture_output=True, text=True, timeout=60)

            if result.returncode != 0:
                print(f"Lipsync generation error: {result.stderr}")
                return False

            # lipsync_generator creates audio_name_duck.webm, rename to our standard name
            generated_video = audio_path.parent / f"{audio_path.stem}_duck.webm"
            if generated_video.exists():
                generated_video.rename(self.latest_video)
                print(f"Video saved: {self.latest_video}")
                return True
            else:
                print(f"Error: Expected video not found at {generated_video}")
                return False

        except subprocess.TimeoutExpired:
            print("Lipsync generation timeout")
            return False
        except Exception as e:
            print(f"Lipsync generation error: {e}")
            return False

    def take_screenshot_and_generate_video(self):
        """Full pipeline: screenshot -> question -> audio -> video"""
        try:
            # 1. Take screenshot
            print(f"\n[{datetime.now().strftime('%H:%M:%S')}] Taking screenshot #{self.screenshot_count}...")
            img = ImageGrab.grab()
            img = img.resize((1280, 720), Image.LANCZOS)
            screenshot_path = self.screenshots_dir / f"screenshot_{self.screenshot_count}.png"
            img.save(screenshot_path, optimize=True, quality=85)

            # 2. Generate question with Claude
            print("Analyzing with Claude...")
            question = self.analyze_screenshot_with_claude(screenshot_path)

            if not question:
                print("Failed to generate question")
                return

            print(f"Question: {question}")
            self.last_analysis = question

            # 3. Generate TTS audio
            print("Generating TTS audio...")
            if not self.generate_audio_with_fish(question):
                print("Failed to generate audio")
                return

            # 4. Generate lip-sync video
            if not self.generate_lipsync_video(self.latest_audio, question):
                print("Failed to generate video")
                return

            print(f"Video generation complete: {self.latest_video}")

            self.screenshot_count += 1
            self.last_screenshot_time = time.time()

            # Cleanup old screenshots
            self.cleanup_old_screenshots()

        except Exception as e:
            print(f"Screenshot pipeline error: {e}")

    def cleanup_old_screenshots(self):
        """Keep only the last 2 screenshots"""
        try:
            files = sorted(
                [f for f in self.screenshots_dir.glob("screenshot_*.png")],
                key=lambda x: x.stat().st_mtime
            )
            if len(files) > 2:
                for old_file in files[:-2]:
                    old_file.unlink()
                    print(f"Deleted old screenshot: {old_file.name}")
        except Exception as e:
            print(f"Cleanup error: {e}")

    def run_async(self):
        """Run screenshot+video generation loop"""
        self.running = True
        print(f"Screenshot Video Generator started (interval: {self.interval}s)")

        while self.running:
            try:
                self.take_screenshot_and_generate_video()
                time.sleep(self.interval)
            except KeyboardInterrupt:
                break
            except Exception as e:
                print(f"Screenshot loop error: {e}")
                time.sleep(self.interval)

        print("Screenshot Video Generator stopped")

    def stop(self):
        """Stop the generator"""
        self.running = False

    def get_latest_video_path(self):
        """Get path to the latest generated video"""
        if self.latest_video.exists():
            return str(self.latest_video.absolute())
        return None
