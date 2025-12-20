#!/bin/bash

# Magisk Module Creator for AI-EPABX
# Creates the gateway.zip module for installation via Magisk Manager

set -e

echo "=========================================="
echo "Creating AI-EPABX Magisk Module"
echo "=========================================="
echo ""

# Create temporary directory
TEMP_DIR="$(mktemp -d)"
MODULE_DIR="$TEMP_DIR/aiepabx_gateway"

echo "Creating module structure..."

# Create directory structure
mkdir -p "$MODULE_DIR/system/etc/permissions"
mkdir -p "$MODULE_DIR/META-INF/com/google/android"

# Create module.prop
cat > "$MODULE_DIR/module.prop" << 'EOF'
id=aiepabx_gateway
name=AI-EPABX GSM Gateway
version=1.0
versionCode=1
author=Deep Shetye
description=Grants system permissions for AI-EPABX call routing and auto-answer
EOF

echo "✓ Created module.prop"

# Create service.sh
cat > "$MODULE_DIR/service.sh" << 'EOF'
#!/system/bin/sh

# Wait for boot complete
until [ "$(getprop sys.boot_completed)" == 1 ]; do
    sleep 1
done

# Grant required permissions to app
PACKAGE="com.deepshetye.AIEPABX"

pm grant $PACKAGE android.permission.CAPTURE_AUDIO_OUTPUT
pm grant $PACKAGE android.permission.MODIFY_PHONE_STATE
pm grant $PACKAGE android.permission.READ_PRECISE_PHONE_STATE
pm grant $PACKAGE android.permission.ANSWER_PHONE_CALLS
pm grant $PACKAGE android.permission.CALL_PHONE
pm grant $PACKAGE android.permission.READ_PHONE_STATE

# Set app to not be optimized (keep alive)
dumpsys deviceidle whitelist +$PACKAGE

# Log success
echo "[AI-EPABX] Permissions granted successfully" >> /data/local/tmp/aiepabx_permissions.log
EOF

chmod +x "$MODULE_DIR/service.sh"
echo "✓ Created service.sh"

# Create update-binary (required by Magisk)
cat > "$MODULE_DIR/META-INF/com/google/android/update-binary" << 'EOF'
#!/sbin/sh

#################
# Initialization
#################

umask 022

# echo before loading util_functions
ui_print() { echo "$1"; }

require_new_magisk() {
  ui_print "*******************************"
  ui_print " Please install Magisk v20.4+! "
  ui_print "*******************************"
  exit 1
}

#########################
# Load util_functions.sh
#########################

OUTFD=$2
ZIPFILE=$3

mount /data 2>/dev/null

[ -f /data/adb/magisk/util_functions.sh ] || require_new_magisk
. /data/adb/magisk/util_functions.sh
[ $MAGISK_VER_CODE -lt 20400 ] && require_new_magisk

install_module
exit 0
EOF

chmod +x "$MODULE_DIR/META-INF/com/google/android/update-binary"
echo "✓ Created update-binary"

# Create updater-script (required but can be empty)
cat > "$MODULE_DIR/META-INF/com/google/android/updater-script" << 'EOF'
#MAGISK
EOF

echo "✓ Created updater-script"

# Create permissions XML
cat > "$MODULE_DIR/system/etc/permissions/aiepabx.xml" << 'EOF'
<?xml version="1.0" encoding="utf-8"?>
<permissions>
    <privapp-permissions package="com.deepshetye.AIEPABX">
        <permission name="android.permission.CAPTURE_AUDIO_OUTPUT"/>
        <permission name="android.permission.MODIFY_PHONE_STATE"/>
        <permission name="android.permission.READ_PRECISE_PHONE_STATE"/>
        <permission name="android.permission.ANSWER_PHONE_CALLS"/>
        <permission name="android.permission.CALL_PHONE"/>
        <permission name="android.permission.READ_PHONE_STATE"/>
    </privapp-permissions>
</permissions>
EOF

echo "✓ Created permissions XML"

# Create the ZIP file
OUTPUT_DIR="$(pwd)/magisk"
mkdir -p "$OUTPUT_DIR"
OUTPUT_FILE="$OUTPUT_DIR/gateway.zip"

echo ""
echo "Creating ZIP file..."
cd "$TEMP_DIR"
zip -r "$OUTPUT_FILE" aiepabx_gateway/ -x "*.DS_Store"

echo ""
echo "=========================================="
echo "✅ Magisk Module Created Successfully!"
echo "=========================================="
echo ""
echo "Module location: $OUTPUT_FILE"
echo ""
echo "Next steps:"
echo "1. Transfer gateway.zip to your Android device"
echo "2. Install via Magisk Manager (Modules > Install from storage)"
echo "3. Reboot device"
echo "4. Verify module is active in Magisk Manager"
echo ""
echo "Transfer command:"
echo "  adb push $OUTPUT_FILE /sdcard/Download/"
echo ""

# Cleanup
rm -rf "$TEMP_DIR"
