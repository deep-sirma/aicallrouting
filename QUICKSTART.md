# GSM-SIP Gateway Integration - Quick Start Guide

## Overview

This project now includes full GSM-SIP gateway integration for automated AI call handling. The system automatically answers incoming calls and routes audio to your AI endpoint via WebSocket.

## Architecture

```
Caller (A) → GSM Call → Device B (Rooted Android)
                            ↓
                    Auto-Answer + Audio Capture
                            ↓
                    WebSocket Streaming
                            ↓
                      AI Endpoint (C)
                            ↓
                    Audio Response
                            ↓
                  Inject into Call → Caller Hears AI
```

## Setup Steps

### 1. Clone Required Repositories

```bash
cd /Users/impactoinfra/CallRouting

# Clone telephony module
git clone https://github.com/telon-org/react-native-tele.git

# Clone SIP module
git clone https://github.com/telon-org/react-native-sip2.git
```

Your directory structure should be:
```
/Users/impactoinfra/CallRouting/
├── aicallrouting/           # Your project
├── react-native-tele/       # Telephony module
└── react-native-sip2/       # SIP module
```

### 2. Install Dependencies

```bash
cd aicallrouting
npm install
```

### 3. Configure WebSocket Endpoint

Edit `utils/websocketManager.ts`:

```typescript
const WEBSOCKET_URL = "wss://your-endpoint-url-here";
```

### 4. Install Magisk Module

Follow instructions in `docs/MagiskModule.md` to:
1. Create the Magisk module
2. Flash it via Magisk Manager
3. Reboot device
4. Verify permissions are granted

### 5. (Optional) Use New App Component

To use the new GSM-integrated app:

```bash
# Backup current App.tsx
mv App.tsx App_OLD.tsx

# Use new GSM app
mv App_GSM.tsx App.tsx
```

Or manually merge the functionality.

### 6. Build and Deploy

```bash
npm run android
```

## Testing

1. **Launch app** on rooted device
2. **Grant permissions** when prompted
3. **Call the device** from another phone
4. **Verify**:
   - ✅ Call is auto-answered
   - ✅ WebSocket connects
   - ✅ Audio streaming starts
   - ✅ Transcriptions appear
   - ✅ AI responses are heard by caller

## Key Features

✅ **Auto-Answer**: No human interaction needed  
✅ **WebSocket Streaming**: Real-time audio to AI  
✅ **Bidirectional Audio**: AI talks back to caller  
✅ **Session Management**: Automatic session handling  
✅ **Conversation Tracking**: UI shows conversation flow  

## Components Created

| File | Purpose |
|------|---------|
| `utils/telephonyManager.ts` | GSM call handling with auto-answer |
| `utils/sipManager.ts` | SIP integration (for future use) |
| `utils/websocketManager.ts` | WebSocket audio streaming |
| `utils/audioBridge.ts` | Audio routing GSM ↔ WebSocket |
| `App_GSM.tsx` | New app with full integration |
| `docs/AudioBridgeModule.md` | Native Android module docs |
| `docs/MagiskModule.md` | Magisk setup guide |

## WebSocket Protocol

Your WebSocket server should handle these message types:

### From App to Server 

```json
{
  "type": "audio",
  "sessionId": "session_xxx",
  "data": {
    "audio": "base64_encoded_pcm",
    "sampleRate": 16000,
    "channels": 1,
    "format": "pcm"
  }
}
```

### From Server to App

```json
{
  "type": "transcription",
  "sessionId": "session_xxx",
  "data": {
    "text": "Hello, how can I help?"
  }
}
```

```json
{
  "type": "response",
  "sessionId": "session_xxx",
  "data": {
    "audio": "base64_encoded_audio"
  }
}
```

Or send raw binary audio data directly.

## Troubleshooting

### Auto-Answer Not Working
- Verify Magisk module is installed and active
- Check permissions: `adb shell dumpsys package com.deepshetye.AIEPABX | grep permission`
- Ensure device is rooted with Magisk

### WebSocket Not Connecting
- Update WebSocket URL in `utils/websocketManager.ts`
- Check network connectivity
- Verify WebSocket server is running

### No Audio in Call
- Check Magisk permissions (CAPTURE_AUDIO_OUTPUT)
- Verify AudioBridgeModule is properly registered
- Check logs: `adb logcat | grep AudioBridge`

### Build Errors
- Ensure repositories are cloned in parent directory
- Run `npm install` again
- Clear cache: `npm start --reset-cache`

## Next Steps

1. **Set up your WebSocket endpoint** (provide URL when ready)
2. **Configure AI backend** to handle audio streaming
3. **Test with live calls** and iterate
4. **Optimize audio quality** and latency

## Support

See detailed documentation in:
- `docs/AudioBridgeModule.md` - Native module implementation
- `docs/MagiskModule.md` - Root permissions setup
- `SETUP.md` - Complete setup instructions

## Current Status

✅ Infrastructure complete
✅ Telephony integration done
✅ WebSocket streaming ready
✅ Audio bridge implemented
⏳ Waiting for WebSocket endpoint URL
⏳ Testing on device required
