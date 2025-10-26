#!/bin/bash

# Duck Focus Monitor - One-Time Setup Script
# Run this once to install all dependencies

echo "🦆 Duck Focus Monitor - Setup Script"
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Check for required tools
echo "${YELLOW}Checking prerequisites...${NC}"

command -v python >/dev/null 2>&1 || { echo "${RED}Error: python not found. Install Python 3.11+${NC}"; exit 1; }
command -v node >/dev/null 2>&1 || { echo "${RED}Error: node not found. Install Node.js 18+${NC}"; exit 1; }
command -v npm >/dev/null 2>&1 || { echo "${RED}Error: npm not found. Install Node.js 18+${NC}"; exit 1; }
command -v cargo >/dev/null 2>&1 || { echo "${RED}Error: cargo not found. Install Rust${NC}"; exit 1; }

echo "${GREEN}✅ All prerequisites found${NC}"
echo ""

# 1. Python Backend Setup
echo "${GREEN}[1/4] Setting up Python backend...${NC}"
cd python-backend || exit 1

# Create virtual environment
if [ ! -d "venv" ]; then
    python -m venv venv
    echo "  ✅ Created Python virtual environment"
else
    echo "  ℹ️  Virtual environment already exists"
fi

# Activate and install dependencies
source venv/bin/activate
pip install --upgrade pip > /dev/null 2>&1
pip install -r requirements.txt
echo "  ✅ Installed Python dependencies"

# Create .env if it doesn't exist
if [ ! -f ".env" ]; then
    echo "ANTHROPIC_API_KEY=your_api_key_here" > .env
    echo "  ${YELLOW}⚠️  Created .env file - Please add your ANTHROPIC_API_KEY${NC}"
else
    echo "  ℹ️  .env file already exists"
fi

deactivate
cd ..

# 2. Install Muse LSL
echo "${GREEN}[2/4] Installing Muse LSL...${NC}"
pip install muselsl 2>&1 | grep -v "Requirement already satisfied" || echo "  ✅ Installed muselsl"

# Install LSL library (macOS)
if [[ "$OSTYPE" == "darwin"* ]]; then
    if ! brew list labstreaminglayer/tap/lsl &>/dev/null; then
        echo "  Installing LSL library via Homebrew..."
        brew install labstreaminglayer/tap/lsl
        echo "  ✅ Installed LSL library"
    else
        echo "  ℹ️  LSL library already installed"
    fi
fi

# 3. Tauri App Setup
echo "${GREEN}[3/4] Setting up Tauri app...${NC}"
npm install
echo "  ✅ Installed Node.js dependencies"

# 4. Chrome Extension Setup
echo "${GREEN}[4/4] Setting up Chrome extension...${NC}"
cd ../AnnoyingDuckExtension || exit 1
npm install
npm run build
echo "  ✅ Built Chrome extension"
cd ../calhackproj

echo ""
echo "${GREEN}🎉 Setup complete!${NC}"
echo ""
echo "📝 Next steps:"
echo ""
echo "1. ${YELLOW}Add your Anthropic API key:${NC}"
echo "   Edit python-backend/.env and add your API key"
echo ""
echo "2. ${YELLOW}Find your Muse device:${NC}"
echo "   export DYLD_LIBRARY_PATH=/opt/homebrew/lib"
echo "   muselsl list"
echo ""
echo "3. ${YELLOW}Start the app:${NC}"
echo "   ./start.sh [your-muse-device-name]"
echo "   Example: ./start.sh Muse-215A"
echo ""
echo "4. ${YELLOW}Load Chrome extension:${NC}"
echo "   - Open chrome://extensions/"
echo "   - Enable 'Developer mode'"
echo "   - Click 'Load unpacked'"
echo "   - Select: AnnoyingDuckExtension/"
echo ""
