#!/bin/bash
set -e

echo "=== Sovereign Wallet — Setup ==="
echo ""

# Check Node.js version
NODE_VERSION=$(node -v 2>/dev/null | sed 's/v//' | cut -d. -f1)
if [ -z "$NODE_VERSION" ]; then
  echo "[ERROR] Node.js not found. Install Node.js 18+ from https://nodejs.org"
  exit 1
fi
if [ "$NODE_VERSION" -lt 18 ]; then
  echo "[ERROR] Node.js $NODE_VERSION detected. Requires Node.js 18+."
  exit 1
fi
echo "[OK] Node.js v$(node -v | sed 's/v//') detected"

# Copy .env if needed
if [ ! -f .env ]; then
  cp .env.example .env
  echo "[OK] .env created from .env.example"
  echo "     Edit it with your node URL before building."
  echo ""
else
  echo "[OK] .env already exists"
fi

echo ""

# Install dependencies
echo "Installing dependencies..."
npm install --silent
echo "[OK] Dependencies installed"

echo ""

# Build
echo "Building extension..."
npm run build
echo "[OK] Build complete in dist/"

echo ""
echo "=== How to load in Chrome ==="
echo ""
echo "1. Open Chrome and navigate to chrome://extensions/"
echo "2. Enable 'Developer mode' (top right toggle)"
echo "3. Click 'Load unpacked' and select the dist/ folder"
echo "4. Accept the SSL certificate for your node:"
echo "   Navigate to https://YOUR_NODE_IP:50002 and accept"
echo ""
echo "To generate a distributable zip:"
echo "  npm run build:prod"
echo ""
