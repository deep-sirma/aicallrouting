# AI-EPABX GSM Gateway

Automated AI call routing system with GSM-SIP gateway integration for fully automated call handling.

## Quick Setup

### 1. Clone Required Repositories

Run the automated setup script:

```bash
./setup-repositories.sh
```

This will:
- Clone `react-native-tele` (telephony module)
- Clone `react-native-sip2` (SIP module)
- Install all dependencies
- Verify setup

### 2. Configure WebSocket Endpoint

Edit `utils/websocketManager.ts` and set your WebSocket URL:

```typescript
const WEBSOCKET_URL = "wss://your-endpoint-url";
```

### 3. Set Up Rooted Device

Follow [docs/MagiskModule.md](docs/MagiskModule.md) to:
1. Create Magisk module
2. Flash on rooted device
3. Grant system permissions

### 4. Build and Deploy

```bash
npm run android
```

## Features

✅ **Auto-Answer Calls** - No human interaction needed  
✅ **Real-time Audio Streaming** - WebSocket streaming to AI  
✅ **Bidirectional Audio** - AI responses injected into call  
✅ **Session Management** - Automatic conversation tracking  
✅ **Full GSM Integration** - Using react-native-tele

## Documentation

- **[QUICKSTART.md](QUICKSTART.md)** - Quick reference guide
- **[SETUP.md](SETUP.md)** - Detailed setup instructions
- **[docs/MagiskModule.md](docs/MagiskModule.md)** - Root permissions setup
- **[docs/AudioBridgeModule.md](docs/AudioBridgeModule.md)** - Native module docs

## Architecture

```
Caller → GSM Call → Device B (Rooted Android)
                        ↓
                Auto-Answer + Audio Capture
                        ↓
                WebSocket Streaming
                        ↓
                  AI Endpoint
                        ↓
                 Audio Response
                        ↓
              Inject into Call → Caller Hears AI
```

## Requirements

- **Rooted Android device** with Magisk
- **Android 8.0+** (14 supported)
- **Active SIM card**
- **WebSocket endpoint** for AI processing

## Troubleshooting

See [QUICKSTART.md](QUICKSTART.md) for common issues and solutions.

## License

Private
