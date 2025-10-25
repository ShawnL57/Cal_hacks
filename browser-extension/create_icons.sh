#!/bin/bash
# Quick script to create placeholder icons using ImageMagick
# Install ImageMagick: brew install imagemagick

if ! command -v convert &> /dev/null; then
    echo "ImageMagick not found. Install with: brew install imagemagick"
    echo "Or run: python3 create_icons.py (if you have PIL installed)"
    exit 1
fi

cd icons

# Create 128x128 base icon
convert -size 128x128 xc:"#667eea" \
    -fill white \
    -font "Apple-Color-Emoji" \
    -pointsize 90 \
    -gravity center \
    -annotate +0+0 "🦆" \
    icon128.png

# Resize for other sizes
convert icon128.png -resize 48x48 icon48.png
convert icon128.png -resize 16x16 icon16.png

echo "✅ Icons created successfully!"
ls -lh icon*.png
