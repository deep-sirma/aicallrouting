#!/bin/bash

# GSM-SIP Gateway Repository Setup Script
# This script clones required repositories and configures dependencies

set -e  # Exit on error

echo "=========================================="
echo "GSM-SIP Gateway Repository Setup"
echo "=========================================="
echo ""

# Get the parent directory (one level up from current project)
PARENT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "Parent directory: $PARENT_DIR"
echo "Project directory: $PROJECT_DIR"
echo ""

# Repository URLs
TELE_REPO="https://github.com/telon-org/react-native-tele.git"
SIP_REPO="https://github.com/telon-org/react-native-sip2.git"
DIALER_REPO="https://github.com/telon-org/react-native-replace-dialer.git"

# Repository directories
TELE_DIR="$PARENT_DIR/react-native-tele"
SIP_DIR="$PARENT_DIR/react-native-sip2"
DIALER_DIR="$PARENT_DIR/react-native-replace-dialer"

# Function to clone or update repository
clone_or_update() {
    local repo_url=$1
    local repo_dir=$2
    local repo_name=$(basename "$repo_dir")
    
    if [ -d "$repo_dir" ]; then
        echo "✓ $repo_name already exists at $repo_dir"
        read -p "  Do you want to update it? (y/N): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            echo "  Updating $repo_name..."
            cd "$repo_dir"
            git pull
            echo "  ✓ Updated"
        else
            echo "  Skipping update"
        fi
    else
        echo "Cloning $repo_name..."
        git clone "$repo_url" "$repo_dir"
        echo "✓ Cloned $repo_name"
    fi
    echo ""
}

# Clone repositories
echo "Step 1: Cloning required repositories"
echo "--------------------------------------"

clone_or_update "$TELE_REPO" "$TELE_DIR"
clone_or_update "$SIP_REPO" "$SIP_DIR"

echo "Optional: Clone dialer replacement module"
read -p "Do you want to clone react-native-replace-dialer? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    clone_or_update "$DIALER_REPO" "$DIALER_DIR"
fi

echo ""
echo "Step 2: Installing dependencies in cloned repositories"
echo "-------------------------------------------------------"

# Install dependencies in react-native-tele
if [ -d "$TELE_DIR" ]; then
    echo "Installing dependencies in react-native-tele..."
    cd "$TELE_DIR"
    if [ -f "package.json" ]; then
        npm install 2>/dev/null || echo "  (No npm dependencies or already installed)"
    fi
    echo "✓ Done"
    echo ""
fi

# Install dependencies in react-native-sip2
if [ -d "$SIP_DIR" ]; then
    echo "Installing dependencies in react-native-sip2..."
    cd "$SIP_DIR"
    if [ -f "package.json" ]; then
        npm install 2>/dev/null || echo "  (No npm dependencies or already installed)"
    fi
    echo "✓ Done"
    echo ""
fi

echo "Step 3: Installing project dependencies"
echo "----------------------------------------"
cd "$PROJECT_DIR"
echo "Running npm install..."
npm install
echo "✓ Dependencies installed"
echo ""

echo "Step 4: Verifying setup"
echo "-----------------------"

# Check if repositories exist
if [ -d "$TELE_DIR" ]; then
    echo "✓ react-native-tele: FOUND"
else
    echo "✗ react-native-tele: NOT FOUND"
fi

if [ -d "$SIP_DIR" ]; then
    echo "✓ react-native-sip2: FOUND"
else
    echo "✗ react-native-sip2: NOT FOUND"
fi

# Check package.json dependencies
if grep -q "react-native-tele" "$PROJECT_DIR/package.json"; then
    echo "✓ package.json includes react-native-tele"
else
    echo "✗ package.json missing react-native-tele dependency"
fi

if grep -q "react-native-sip2" "$PROJECT_DIR/package.json"; then
    echo "✓ package.json includes react-native-sip2"
else
    echo "✗ package.json missing react-native-sip2 dependency"
fi

echo ""
echo "=========================================="
echo "Setup Complete!"
echo "=========================================="
echo ""
echo "Directory structure:"
echo "$PARENT_DIR/"
echo "├── aicallrouting/          (your project)"
echo "├── react-native-tele/      (telephony module)"
echo "└── react-native-sip2/      (SIP module)"
echo ""
echo "Next steps:"
echo "1. Configure WebSocket endpoint in utils/websocketManager.ts"
echo "2. Set up Magisk module (see docs/MagiskModule.md)"
echo "3. Build: npm run android"
echo ""
echo "For more information, see:"
echo "- QUICKSTART.md"
echo "- SETUP.md"
echo "- walkthrough.md (in .gemini/antigravity/brain/*/)"
echo ""
