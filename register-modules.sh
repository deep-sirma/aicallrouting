#!/bin/bash

# Script to install the ReactPackage and update MainApplication.kt

set -e

echo "=========================================="
echo "Registering Native Modules"
echo "=========================================="
echo ""

TARGET_DIR="android/app/src/main/java/com/deepshetye/AIEPABX"

# 1. Install AIEPABXPackage.java
echo "📋 Installing AIEPABXPackage.java..."
cp "native-modules/AIEPABXPackage.java" "$TARGET_DIR/AIEPABXPackage.java"

# 2. Update MainApplication.kt
MAIN_APP="$TARGET_DIR/MainApplication.kt"
echo "🔧 Updating MainApplication.kt..."

# Check if already added
if grep -q "AIEPABXPackage()" "$MAIN_APP"; then
    echo "⚠️  AIEPABXPackage already registered in MainApplication.kt"
else
    # sed command to insert line after "PackageList(this).packages.apply {"
    # We use a temp file to be safe
    sed '/PackageList(this).packages.apply {/a\
              add(AIEPABXPackage())' "$MAIN_APP" > "${MAIN_APP}.tmp" && mv "${MAIN_APP}.tmp" "$MAIN_APP"
    echo "✅ Added AIEPABXPackage to MainApplication.kt"
fi

echo ""
echo "=========================================="
echo "Done! Initializing rebuild..."
echo "=========================================="
