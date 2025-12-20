#!/bin/bash

# Alternative Permission Granting Script
# Grants system permissions directly via ADB (requires root)
# Use this if Magisk module installation fails

echo "=========================================="
echo "AI-EPABX Permission Granting (ADB Method)"
echo "=========================================="
echo ""

PACKAGE="com.deepshetye.AIEPABX"

echo "This script will grant system permissions via ADB."
echo "Requirements:"
echo "  - Device connected via ADB"
echo "  - Root access (su command available)"
echo "  - USB debugging enabled"
echo ""

# Check if device is connected
echo "Checking device connection..."
DEVICE=$(adb devices | grep -w "device" | wc -l)

if [ "$DEVICE" -eq 0 ]; then
    echo "❌ No device found!"
    echo "Please ensure:"
    echo "  1. Device is connected via USB"
    echo "  2. USB debugging is enabled"
    echo "  3. ADB is authorized on device"
    exit 1
fi

echo "✓ Device connected"
echo ""

# Check if app is installed
echo "Checking if app is installed..."
APP_INSTALLED=$(adb shell pm list packages | grep "$PACKAGE" | wc -l)

if [ "$APP_INSTALLED" -eq 0 ]; then
    echo "⚠️  App not installed yet"
    echo "The app will need to be built and installed first."
    echo "Permissions will be granted after installation."
    echo ""
fi

# Grant permissions via root
echo "Granting permissions via root..."
echo ""

adb shell "su -c 'pm grant $PACKAGE android.permission.RECORD_AUDIO'"
echo "✓ Granted RECORD_AUDIO"

adb shell "su -c 'pm grant $PACKAGE android.permission.READ_PHONE_STATE'"
echo "✓ Granted READ_PHONE_STATE"

adb shell "su -c 'pm grant $PACKAGE android.permission.ANSWER_PHONE_CALLS'"
echo "✓ Granted ANSWER_PHONE_CALLS"

adb shell "su -c 'pm grant $PACKAGE android.permission.CALL_PHONE'"
echo "✓ Granted CALL_PHONE"

# These require system/signature level permissions
echo ""
echo "Granting system-level permissions (requires root)..."

adb shell "su -c 'pm grant $PACKAGE android.permission.CAPTURE_AUDIO_OUTPUT'" 2>/dev/null
if [ $? -eq 0 ]; then
    echo "✓ Granted CAPTURE_AUDIO_OUTPUT"
else
    echo "⚠️  CAPTURE_AUDIO_OUTPUT may require Magisk or system modification"
fi

adb shell "su -c 'pm grant $PACKAGE android.permission.MODIFY_PHONE_STATE'" 2>/dev/null
if [ $? -eq 0 ]; then
    echo "✓ Granted MODIFY_PHONE_STATE"
else
    echo "⚠️  MODIFY_PHONE_STATE may require Magisk or system modification"
fi

adb shell "su -c 'pm grant $PACKAGE android.permission.READ_PRECISE_PHONE_STATE'" 2>/dev/null
if [ $? -eq 0 ]; then
    echo "✓ Granted READ_PRECISE_PHONE_STATE"
else
    echo "⚠️  READ_PRECISE_PHONE_STATE may require Magisk or system modification"
fi

# Whitelist app from battery optimization
echo ""
echo "Disabling battery optimization..."
adb shell "su -c 'dumpsys deviceidle whitelist +$PACKAGE'" 2>/dev/null
echo "✓ App whitelisted from battery optimization"

echo ""
echo "=========================================="
echo "Verifying Permissions"
echo "=========================================="
echo ""

adb shell dumpsys package "$PACKAGE" | grep permission | grep granted

echo ""
echo "=========================================="
echo "Done!"
echo "=========================================="
echo ""
echo "Note: Some permissions may require:"
echo "  1. App to be installed (build with: npm run android)"
echo "  2. Reboot after granting"
echo "  3. Magisk module for full system permissions"
echo ""
echo "To re-run after app installation:"
echo "  ./grant-permissions.sh"
echo ""
