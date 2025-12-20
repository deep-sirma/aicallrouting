# Magisk Module for GSM-SIP Gateway

## Purpose
The Magisk module grants system-level permissions required for:
- Auto-answering incoming calls programmatically
- Capturing audio from active telephony calls
- Modifying phone state without user interaction
- Accessing precise phone state information

## Required Permissions

The following permissions require root access and cannot be granted through normal means:

1. **CAPTURE_AUDIO_OUTPUT** - Capture audio from voice calls
2. **MODIFY_PHONE_STATE** - Auto-answer, hangup, modify call state
3. **READ_PRECISE_PHONE_STATE** - Read detailed call information

## Module Structure

Create the following directory structure:

```
android/magisk/
├── gateway/
│   ├── module.prop
│   ├── service.sh
│   └── system/
│       └── etc/
│           └── permissions/
│               └── aiepabx.xml
```

## Files

### module.prop

```properties
id=aiepabx_gateway
name=AI-EPABX GSM Gateway
version=1.0
versionCode=1
author=Deep Shetye
description=Grants system permissions for AI-EPABX call routing
```

### service.sh

```bash
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
```

### system/etc/permissions/aiepabx.xml

```xml
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
```

## Building the Module

### Option 1: Manual ZIP Creation

```bash
cd android/magisk
zip -r gateway.zip gateway/
```

### Option 2: Using Magisk Module Template

1. Clone the Magisk Module Template:
   ```bash
   git clone https://github.com/topjohnwu/magisk-module-template gateway
   ```

2. Replace files with the ones above

3. Create ZIP:
   ```bash
   zip -r gateway.zip gateway/ -x "*.git*"
   ```

## Installation Steps

### On Device

1. **Install Magisk Manager** (if not already installed)
   - Download from: https://github.com/topjohnwu/Magisk/releases
   - Install the APK

2. **Flash the Module**
   - Open Magisk Manager
   - Go to Modules tab
   - Click "Install from storage"
   - Select `gateway.zip`
   - Wait for installation to complete

3. **Reboot Device**
   - Reboot is required for permissions to take effect
   - After reboot, open Magisk Manager
   - Verify module is active

4. **Verify Permissions**
   ```bash
   adb shell dumpsys package com.deepshetye.AIEPABX | grep permission
   ```

   You should see:
   ```
   android.permission.CAPTURE_AUDIO_OUTPUT: granted=true
   android.permission.MODIFY_PHONE_STATE: granted=true
   android.permission.READ_PRECISE_PHONE_STATE: granted=true
   ```

## Troubleshooting

### Module Not Active

1. Check Magisk logs:
   - Open Magisk Manager
   - Go to Logs tab
   - Look for errors related to aiepabx_gateway

2. Verify module structure:
   ```bash
   adb shell ls -R /data/adb/modules/aiepabx_gateway
   ```

### Permissions Not Granted

1. Check service.sh execution:
   ```bash
   adb shell cat /data/local/tmp/aiepabx_permissions.log
   ```

2. Manually grant permissions:
   ```bash
   adb shell
   su
   pm grant com.deepshetye.AIEPABX android.permission.CAPTURE_AUDIO_OUTPUT
   pm grant com.deepshetye.AIEPABX android.permission.MODIFY_PHONE_STATE
   pm grant com.deepshetye.AIEPABX android.permission.READ_PRECISE_PHONE_STATE
   ```

### Auto-Answer Not Working

1. Verify MODIFY_PHONE_STATE permission is granted
2. Check if device is on Android 14 (compatibility may vary)
3. Try different ROM (some heavily modified ROMs block this)

## Android Version Compatibility

| Android Version | Status | Notes |
|-----------------|--------|-------|
| 8.0 - 10.0 | ✅ Fully supported | Best compatibility |
| 11.0 - 12.0 | ⚠️ Mostly supported | Some restrictions |
| 13.0 | ⚠️ Limited | Increased security restrictions |
| 14.0 | ⚠️ Limited | Your version - may need additional tweaks |

## Security Considerations

⚠️ **IMPORTANT**: This module grants powerful permissions. Only install on:
- Devices you control
- Devices dedicated to this purpose
- Devices where security implications are understood

## Alternative: Manual Permission Grant

If you don't want to create a Magisk module, you can manually grant permissions after each reboot:

```bash
adb shell
su
pm grant com.deepshetye.AIEPABX android.permission.CAPTURE_AUDIO_OUTPUT
pm grant com.deepshetye.AIEPABX android.permission.MODIFY_PHONE_STATE
pm grant com.deepshetye.AIEPABX android.permission.READ_PRECISE_PHONE_STATE
```

However, the Magisk module makes this automatic and persistent across reboots.
