#!/usr/bin/env python3
"""
Quick script to generate placeholder duck icons for the browser extension
Run: python3 create_icons.py
"""

from PIL import Image, ImageDraw, ImageFont

def create_icon(size):
    # Create image with purple gradient background
    img = Image.new('RGB', (size, size), color=(102, 126, 234))
    draw = ImageDraw.Draw(img)

    # Draw a simple duck emoji or text
    try:
        # Try to use a large font for the emoji
        font_size = int(size * 0.7)
        # Use system default font
        font = ImageFont.truetype("/System/Library/Fonts/Apple Color Emoji.ttc", font_size)
    except:
        # Fallback: just draw a colored circle
        draw.ellipse([size//4, size//4, size*3//4, size*3//4], fill=(255, 215, 0))

    # Draw duck emoji
    emoji = "🦆"
    # Calculate position to center the emoji
    bbox = draw.textbbox((0, 0), emoji, font=font) if 'font' in locals() else (0, 0, size//2, size//2)
    text_width = bbox[2] - bbox[0]
    text_height = bbox[3] - bbox[1]
    x = (size - text_width) // 2
    y = (size - text_height) // 2 - size//10

    if 'font' in locals():
        draw.text((x, y), emoji, font=font, fill=(255, 255, 255))

    return img

# Create icons
sizes = [16, 48, 128]

for size in sizes:
    img = create_icon(size)
    img.save(f'icons/icon{size}.png')
    print(f"Created icon{size}.png")

print("\n✅ All icons created successfully!")
print("Icons are located in the icons/ folder")
