#!/bin/bash

# Script to install the fixed TelephonyModule.java
# This adds incoming call detection and auto-answer functionality

set -e

echo "=========================================="
echo "Installing Fixed TelephonyModule"
echo "=========================================="
echo ""

SOURCE_FILE="native-modules/TelephonyModule.java"
TARGET_DIR="android/app/src/main/java/com/deepshetye/AIEPABX"
TARGET_FILE="$TARGET_DIR/TelephonyModule.java"

# Check if source exists
if [ ! -f "$SOURCE_FILE" ]; then
    echo "❌ Source file not found: $SOURCE_FILE"
    exit 1
fi

# Create backup of existing file if it exists
if [ -f "$TARGET_FILE" ]; then
    BACKUP_FILE="${TARGET_FILE}.backup.$(date +%Y%m%d_%H%M%S)"
    echo "📦 Backing up existing file to: $BACKUP_FILE"
    cp "$TARGET_FILE" "$BACKUP_FILE"
else
    echo "ℹ️  No existing TelephonyModule.java found (will create new)"
fi

# Ensure target directory exists
mkdir -p "$TARGET_DIR"

# Copy the new file
echo "📋 Copying fixed TelephonyModule.java..."
cp "$SOURCE_FILE" "$TARGET_FILE"

echo "✅ TelephonyModule.java installed successfully"
echo ""
echo "What was added:"
echo "  ✅ Incoming call detection using TelecomManager.isRinging()"
echo "  ✅ Auto-answer method using acceptRingingCall()"
echo "  ✅ Improved call state detection"
echo "  ✅ Better logging for debugging"
echo ""
echo "Next steps:"
echo "  1. Rebuild the app: npx expo run:android --device"
echo "  2. Test by calling your device"
echo "  3. Watch logs: adb logcat | grep TelephonyModule"
echo ""
echo "=========================================="
