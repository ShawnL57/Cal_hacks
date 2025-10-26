#!/usr/bin/env python
"""
Screenshot Video Generator
Takes periodic screenshots, generates questions with Claude, creates TTS audio, and generates lip-sync videos
"""
import os
import time
import base64
import subprocess
import logging
from pathlib import Path
from datetime import datetime
from PIL import ImageGrab, Image
from anthropic import Anthropic
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('video_generation.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)


class ScreenshotVideoGenerator:
    """Takes screenshots, generates questions, TTS audio, and lip-sync videos"""

    def __init__(self, interval=30):
        self.interval = interval
        self.screenshot_count = 0
        self.running = False
        self.video_already_sent = False  # Track if current video has been sent

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
            logger.warning("ANTHROPIC_API_KEY not found")
            self.claude_client = None

        # Fish Audio API key
        self.fish_api_key = os.getenv('FISH_AUDIO_API_KEY')
        if not self.fish_api_key:
            logger.warning("FISH_AUDIO_API_KEY not found")

        # Donald Duck voice reference ID
        self.voice_id = "c39a76f685cf4f8fb41cd5d3d66b497d"

        self.last_analysis = None
        self.last_screenshot_time = 0

    def analyze_screenshot_with_claude(self, image_path):
        """Send screenshot to Claude AI and get ONE question"""
        if not self.claude_client:
            return None

        prompt = """You are FocusDuck, a study assistant that ensures users stay actively engaged by asking precise, context-grounded questions.
You will be given a screenshot of a user's screen that shows their study material (could be a PDF, code, article, or notes).
Your task: generate ONE short but specific question that tests whether the user is paying attention and understanding what's on screen.

Rules:
- The question must be *directly tied* to visible text or visual structure in the screenshot.
- Be specific: refer to particular words, numbers, formulas, lines, or UI elements visible.
- Avoid generic questions like "Summarize this" or "What is this about?"
- If the screenshot contains equations, code, or tables, ask about *one element* (e.g. "What does the loop variable 'i' iterate over?")
- If the screenshot is of text, ask about *one detail or reasoning point*.
- The goal is to *catch lapses in focus* — the question should require careful observation or recall.
- Output only the question text, nothing else."""

        try:
            abs_image_path = os.path.abspath(image_path)

            # Detect media type from file extension
            ext = Path(image_path).suffix.lower()
            media_type = "image/jpeg" if ext in ['.jpg', '.jpeg'] else "image/png"

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
                                    "media_type": media_type,
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
            logger.error(f"Claude analysis error: {e}")
            return None

    def generate_audio_with_fish(self, text):
        """Generate TTS audio using Fish Audio API"""
        if not self.fish_api_key:
            logger.error("FISH_AUDIO_API_KEY not configured")
            return False

        try:
            from fish_audio_sdk import Session, TTSRequest

            session = Session(self.fish_api_key)

            logger.info(f"Generating audio: {text[:50]}...")

            with open(self.latest_audio, "wb") as f:
                for chunk in session.tts(
                    TTSRequest(
                        text=text,
                        reference_id=self.voice_id
                    )
                ):
                    f.write(chunk)

            logger.info(f"Audio saved: {self.latest_audio}")
            return True

        except Exception as e:
            logger.error(f"Fish Audio TTS error: {e}")
            return False

    def generate_lipsync_video(self, audio_path, text):
        """Generate lip-sync video using lipsync_generator.py"""
        try:
            lipsync_script = Path(__file__).parent / "lipsync_generator.py"
            logger.info("Generating lip-sync video...")

            # Try python3 first, fallback to python if not found
            python_commands = ['python3', 'python']
            result = None

            for python_cmd in python_commands:
                try:
                    result = subprocess.run([
                        python_cmd,
                        str(lipsync_script),
                        str(audio_path),
                        text
                    ], capture_output=True, text=True, timeout=60)

                    # If command executed (even with error), break the loop
                    logger.info(f"Using {python_cmd} for lipsync generation")
                    break

                except FileNotFoundError:
                    # This python command doesn't exist, try the next one
                    logger.warning(f"{python_cmd} not found, trying next option...")
                    continue

            if result is None:
                logger.error("Neither python3 nor python command found")
                return False

            if result.returncode != 0:
                logger.error(f"Lipsync generation error: {result.stderr}")
                return False

            # lipsync_generator creates audio_name_duck.webm, rename to our standard name
            generated_video = audio_path.parent / f"{audio_path.stem}_duck.webm"
            if generated_video.exists():
                generated_video.rename(self.latest_video)
                logger.info(f"Video saved: {self.latest_video}")
                return True
            else:
                logger.error(f"Expected video not found at {generated_video}")
                return False

        except subprocess.TimeoutExpired:
            logger.error("Lipsync generation timeout")
            return False
        except Exception as e:
            logger.error(f"Lipsync generation error: {e}")
            return False

    def take_screenshot_and_generate_video(self):
        """Full pipeline: screenshot -> question -> audio -> video"""
        # Update timer at the START to enforce 60s interval even if anything fails
        self.last_screenshot_time = time.time()
        logger.info(f"\n[{datetime.now().strftime('%H:%M:%S')}] Taking screenshot #{self.screenshot_count}...")
        logger.info(f"⏱️  Timer set - next screenshot in {self.interval}s")

        try:
            # 1. Take screenshot
            img = ImageGrab.grab()

            # Convert RGBA to RGB if needed (for JPEG compatibility)
            if img.mode == 'RGBA':
                rgb_img = Image.new('RGB', img.size, (255, 255, 255))
                rgb_img.paste(img, mask=img.split()[3])
                img = rgb_img
            elif img.mode != 'RGB':
                img = img.convert('RGB')

            img = img.resize((1280, 720), Image.LANCZOS)
            screenshot_path = self.screenshots_dir / f"screenshot_{self.screenshot_count}.jpg"
            img.save(screenshot_path, format='JPEG', quality=85, optimize=True)
            logger.info(f"Screenshot saved: {screenshot_path}")

            # 2. Generate question with Claude
            logger.info("Analyzing with Claude...")
            question = self.analyze_screenshot_with_claude(screenshot_path)

            if not question:
                logger.error("❌ FAILED: Claude did not generate a question - skipping video generation")
                logger.error(f"   Next attempt in {self.interval}s")
                return

            logger.info(f"✅ Question generated: {question}")
            logger.info(f"   Question hash: {hash(question)} (for duplicate detection)")
            self.last_analysis = question

            # 3. Generate TTS audio
            logger.info("Generating TTS audio...")
            if not self.generate_audio_with_fish(question):
                logger.error("❌ FAILED: Fish Audio TTS generation failed - skipping video")
                logger.error(f"   Next attempt in {self.interval}s")
                return

            # 4. Generate lip-sync video
            logger.info("Generating lip-sync video...")
            if not self.generate_lipsync_video(self.latest_audio, question):
                logger.error("❌ FAILED: Lipsync video generation failed")
                logger.error(f"   Next attempt in {self.interval}s")
                return

            logger.info(f"✅ Video generation complete: {self.latest_video}")

            # Reset the sent flag for the new video
            self.video_already_sent = False
            logger.info("🆕 NEW VIDEO ready to be sent (flag reset)")

            self.screenshot_count += 1

            # Cleanup old screenshots
            self.cleanup_old_screenshots()

        except Exception as e:
            logger.error(f"❌ EXCEPTION in screenshot pipeline: {e}")
            logger.error(f"   Next attempt in {self.interval}s")
            import traceback
            logger.error(traceback.format_exc())

    def cleanup_old_screenshots(self):
        """Keep only the last 2 screenshots"""
        try:
            files = sorted(
                [f for f in self.screenshots_dir.glob("screenshot_*.jpg")],
                key=lambda x: x.stat().st_mtime
            )
            if len(files) > 2:
                for old_file in files[:-2]:
                    old_file.unlink()
                    logger.debug(f"Deleted old screenshot: {old_file.name}")
        except Exception as e:
            logger.error(f"Cleanup error: {e}")

    def run_async(self):
        """Run screenshot+video generation loop"""
        self.running = True
        logger.info(f"Screenshot Video Generator started (interval: {self.interval}s)")

        while self.running:
            try:
                # Only start new video generation if enough time has passed since last screenshot
                current_time = time.time()
                time_since_last = current_time - self.last_screenshot_time

                if time_since_last >= self.interval:
                    # Generate video end-to-end (blocks until complete)
                    self.take_screenshot_and_generate_video()
                else:
                    # Wait a bit before checking again
                    time.sleep(1)

            except KeyboardInterrupt:
                break
            except Exception as e:
                logger.error(f"Screenshot loop error: {e}")
                time.sleep(5)

        logger.info("Screenshot Video Generator stopped")

    def stop(self):
        """Stop the generator"""
        self.running = False

    def get_latest_video_path(self):
        """Get path to the latest generated video"""
        if self.latest_video.exists():
            return str(self.latest_video.absolute())
        return None

    def has_video_been_sent(self):
        """Check if current video has already been sent"""
        return self.video_already_sent

    def mark_video_as_sent(self):
        """Mark current video as sent"""
        self.video_already_sent = True
        logger.info("🔒 Video marked as SENT - will not be sent again until new video generated")
