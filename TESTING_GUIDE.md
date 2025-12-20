# 🎉 GSM-SIP Gateway Integration - READY FOR TESTING!

## ✅ Setup Complete

**Everything is configured and ready to test:**

- ✅ Repositories cloned (react-native-tele, react-native-sip2)
- ✅ Dependencies installed
- ✅ App built and installed on device
- ✅ Permissions granted via ADB
- ✅ WebSocket endpoint configured: `ws://101.53.140.228:8000/api/v1/streaming/ws`
- ✅ Battery optimization disabled

## 📱 What the App Does Now

When someone calls your rooted Android device:

1. **Auto-Answers** the call (no human interaction needed)
2. **Streams audio** to your WebSocket endpoint in real-time
3. **Receives AI responses** from your endpoint
4. **Plays responses** back to the caller
5. **Shows conversation** in the app UI

## 🧪 How to Test

### Test 1: Basic Call Handling

1. **Call your rooted device** from another phone
2. **Watch the app** - it should auto-answer within 1-2 seconds
3. **Check the app UI** - should show "Call Connected" → "AI Active"
4. **Speak into the phone** - audio streams to your WebSocket server
5. **App UI** should display transcriptions (if your server sends them)

### Test 2: WebSocket Connection

Monitor your WebSocket server logs to see:
- Connection established when call connects
- Audio data chunks arriving (base64 encoded PCM)
- Session ID in messages
- Format: `{"type":"audio","sessionId":"session_xxx","data":{...}}`

### Test 3: AI Response

If your server sends back:
```json
{
  "type": "response",
  "data": {
    "audio": "base64_audio_data"
  }
}
```

The caller should hear it through the phone call.

## 📊 Expected App UI States

| State | What It Means |
|-------|---------------|
| ⏸️ "Waiting for call..." | Idle, ready to receive calls |
| 📞 "Incoming Call..." | Call detected, auto-answering |
| 📱 "Call Connected" | Call answered, setting up audio |
| 🎙️ "AI Active" | Audio streaming to WebSocket |
| WebSocket Connected (green dot) | Connected to your AI endpoint |

## 🔍 Troubleshooting

### Call Not Auto-Answering

Check permissions:
```bash
adb shell dumpsys package com.deepshetye.AIEPABX | grep ANSWER_PHONE_CALLS
```

Should show: `granted=true`

If not, run again:
```bash
./grant-permissions.sh
```

### WebSocket Not Connecting

1. Check if server is running: `telnet 101.53.140.228 8000`
2. Check app logs: `adb logcat | grep WebSocket`
3. Verify URL is correct in the app

### No Audio Streaming

Check logs:
```bash
adb logcat | grep -E "(AudioBridge|WebSocket|Telephony)"
```

Look for:
- "Audio bridging started"
- "WebSocket connected"
- "Audio chunk captured"

### App Crashes

View logs:
```bash
adb logcat | grep -E "(FATAL|AndroidRuntime)"
```

## 📱 Permissions Granted

✅ **Working:**
- `ANSWER_PHONE_CALLS` - Auto-answer enabled
- `READ_PHONE_STATE` - Call detection
- `RECORD_AUDIO` - Audio capture
- `CALL_PHONE` - Outgoing calls
- `BLUETOOTH_CONNECT` - Audio routing

⚠️ **Limited (using fallback):**
- `CAPTURE_AUDIO_OUTPUT` - Using expo-av recording instead
- `MODIFY_PHONE_STATE` - Using standard methods

## 🔧 WebSocket Protocol

### From App to Server

```json
{
  "type": "audio",
  "sessionId": "session_1234_abc",
  "data": {
    "audio": "base64_encoded_pcm",
    "sampleRate": 16000,
    "channels": 1,
    "format": "pcm",
    "timestamp": 1234567890
  },
  "timestamp": 1234567890
}
```

### From Server to App

**Transcription:**
```json
{
  "type": "transcription",
  "data": {
    "text": "Hello, how can I help you?"
  }
}
```

**AI Response:**
```json
{
  "type": "response",
  "data": {
    "audio": "base64_encoded_audio"
  }
}
```

**Or send raw binary audio data directly**

## 📝 Next Steps

1. **Test basic call handling** - Call your device, verify auto-answer
2. **Check WebSocket logs** on your server - Verify audio data arrives
3. **Test AI responses** - Send audio back from server
4. **Monitor app logs** - `adb logcat` for debugging
5. **Report issues** - Share logs if something doesn't work

## 🎯 Success Criteria

Your integration is working when:

- ✅ Device auto-answers incoming calls
- ✅ WebSocket connects when call starts
- ✅ Audio chunks arrive at your server
- ✅ App shows "AI Active" state
- ✅ (Optional) AI responses are heard by caller

## 🚀 Ready to Test!

**Call your device now and see it in action!**

For detailed logs:
```bash
adb logcat | grep -E "(TelephonyManager|WebSocket|AudioBridge|AI-EPABX)"
```

Good luck! 🎉
