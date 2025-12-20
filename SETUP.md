# GSM-SIP Gateway Setup Instructions

## Prerequisites

- ✅ Rooted Android 14 device with Magisk installed
- ✅ Active SIM card for receiving calls
- ✅ Node.js and npm installed
- ✅ Android Studio or Android SDK installed

## Step 1: Clone Required Repositories

The GSM-SIP gateway requires sibling repositories. Navigate to the parent directory and clone:

```bash
cd /Users/impactoinfra/CallRouting

# Clone telephony module
git clone https://github.com/telon-org/react-native-tele.git

# Clone SIP module
git clone https://github.com/telon-org/react-native-sip2.git

# Clone dialer replacement (optional)
git clone https://github.com/telon-org/react-native-replace-dialer.git
```

Your directory structure should now look like:
```
/Users/impactoinfra/CallRouting/
├── aicallrouting/           (your project)
├── react-native-tele/       (telephony module)
├── react-native-sip2/       (SIP module)
└── react-native-replace-dialer/ (optional)
```

## Step 2: Install Dependencies

After cloning, return to your project and install:

```bash
cd /Users/impactoinfra/CallRouting/aicallrouting
npm install
```

## Step 3: Install Magisk Module

The Magisk module grants system-level permissions required for:
- Auto-answering calls
- Capturing audio output
- Modifying phone state

1. Download the Magisk module (will be created in android/magisk/)
2. Flash via Magisk Manager:
   - Open Magisk Manager app
   - Go to Modules
   - Install from storage
   - Select `gateway.zip`
   - Reboot device

## Step 4: Grant Permissions

On first launch, grant these permissions:
- ✅ Record Audio
- ✅ Read Phone State
- ✅ Answer Phone Calls
- ✅ Bluetooth Connect (if needed)
- ✅ Bluetooth Scan (if needed)

System permissions (granted via Magisk):
- ✅ CAPTURE_AUDIO_OUTPUT
- ✅ MODIFY_PHONE_STATE
- ✅ READ_PRECISE_PHONE_STATE

## Step 5: Configure WebSocket Endpoint

When your WebSocket endpoint is ready, update the configuration in:
`utils/websocketManager.ts`

```typescript
const WEBSOCKET_URL = "wss://your-endpoint-url";
```

## Step 6: Build and Deploy

```bash
npm run android
```

## Troubleshooting

### Module Not Found Errors
If you see "Cannot find module 'react-native-tele'" or similar:
1. Verify repositories are cloned in the correct location (parent directory)
2. Run `npm install` again
3. Clear cache: `npm start --reset-cache`

### Auto-Answer Not Working
1. Verify device is rooted with Magisk
2. Check Magisk module is installed and active
3. Grant all permissions including system permissions
4. Check logs: `adb logcat | grep Telephony`

### No Audio in Call
1. Verify Magisk module grants CAPTURE_AUDIO_OUTPUT
2. Check audio routing logs: `adb logcat | grep Audio`
3. Ensure WebSocket connection is established

### Build Failures
1. Clean build: `cd android && ./gradlew clean`
2. Rebuild: `cd .. && npm run android`
3. Check Android SDK version compatibility

## Next Steps

After setup is complete:
1. Test auto-answer functionality
2. Test audio routing
3. Configure WebSocket endpoint
4. Test end-to-end AI conversation
