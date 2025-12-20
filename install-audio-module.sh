#!/bin/bash

# Script to install CallAudioModule and updated Package

set -e

echo "=========================================="
echo "Installing Call Audio Module"
echo "=========================================="
echo ""

TARGET_DIR="android/app/src/main/java/com/deepshetye/AIEPABX"

# 1. Install CallAudioModule.java
echo "📋 Installing CallAudioModule.java..."
cp "native-modules/CallAudioModule.java" "$TARGET_DIR/CallAudioModule.java"

# 2. Update AIEPABXPackage.java
echo "📋 Updating AIEPABXPackage.java..."
cp "native-modules/AIEPABXPackage.java" "$TARGET_DIR/AIEPABXPackage.java"

echo "✅ Installed native modules"
echo ""
echo "=========================================="
