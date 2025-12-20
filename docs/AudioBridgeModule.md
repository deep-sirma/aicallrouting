# Native Android Module: AudioBridgeModule

## Purpose
This native module provides audio bridging capabilities for in-call audio injection.

## Location
Create this file at:
```
android/app/src/main/java/com/deepshetye/AIEPABX/AudioBridgeModule.java
```

## Implementation

```java
package com.deepshetye.AIEPABX;

import android.content.Context;
import android.media.AudioAttributes;
import android.media.AudioFormat;
import android.media.AudioManager;
import android.media.AudioTrack;
import android.media.MediaPlayer;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.telecom.Call;
import android.telecom.CallAudioState;
import android.util.Base64;
import android.util.Log;

import androidx.annotation.NonNull;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.ReadableMap;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.modules.core.DeviceEventManagerModule;

import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;

/**
 * Native module for audio bridging during calls
 * Captures audio from calls and injects AI responses
 * Requires root permissions via Magisk for full functionality
 */
public class AudioBridgeModule extends ReactContextBaseJavaModule {
    private static final String TAG = "AudioBridgeModule";
    private static final String MODULE_NAME = "AudioBridgeModule";
    
    private final ReactApplicationContext reactContext;
    private AudioTrack audioTrack;
    private AudioManager audioManager;
    private boolean isCapturing = false;
    private boolean isInitialized = false;
    
    // Audio configuration
    private int sampleRate = 16000;
    private int channels = AudioFormat.CHANNEL_OUT_MONO;
    private int encoding = AudioFormat.ENCODING_PCM_16BIT;
    private int bufferSize;

    public AudioBridgeModule(ReactApplicationContext reactContext) {
        super(reactContext);
        this.reactContext = reactContext;
        this.audioManager = (AudioManager) reactContext.getSystemService(Context.AUDIO_SERVICE);
    }

    @NonNull
    @Override
    public String getName() {
        return MODULE_NAME;
    }

    @ReactMethod
    public void initialize(ReadableMap config, Promise promise) {
        try {
            Log.d(TAG, "Initializing AudioBridgeModule");
            
            if (config.hasKey("sampleRate")) {
                sampleRate = config.getInt("sampleRate");
            }
            
            bufferSize = AudioTrack.getMinBufferSize(sampleRate, channels, encoding);
            Log.d(TAG, "Audio config: sampleRate=" + sampleRate + ", bufferSize=" + bufferSize);
            
            isInitialized = true;
            promise.resolve(true);
            
        } catch (Exception e) {
            Log.e(TAG, "Failed to initialize audio bridge", e);
            promise.reject("INIT_ERROR", e.getMessage());
        }
    }

    @ReactMethod
    public void injectAudio(String base64Audio, Promise promise) {
        try {
            Log.d(TAG, "Injecting audio into call");

            byte[] audioData = Base64.decode(base64Audio, Base64.DEFAULT);
            Log.d(TAG, "Audio data size: " + audioData.length + " bytes");

            AudioAttributes audioAttributes = new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION)
                .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                .build();

            AudioFormat audioFormat = new AudioFormat.Builder()
                .setSampleRate(sampleRate)
                .setChannelMask(channels)
                .setEncoding(encoding)
                .build();

            audioTrack = new AudioTrack(
                audioAttributes,
                audioFormat,
                bufferSize,
                AudioTrack.MODE_STREAM,
                AudioManager.AUDIO_SESSION_ID_GENERATE
            );

            audioManager.setMode(AudioManager.MODE_IN_CALL);
            audioManager.setSpeakerphoneOn(false);

            audioTrack.play();
            int bytesWritten = audioTrack.write(audioData, 0, audioData.length);
            Log.d(TAG, "Bytes written: " + bytesWritten);

            new Handler(Looper.getMainLooper()).postDelayed(() -> {
                if (audioTrack != null) {
                    audioTrack.stop();
                    audioTrack.release();
                    audioTrack = null;
                }
                audioManager.setMode(AudioManager.MODE_NORMAL);
            }, (audioData.length * 1000) / (sampleRate * 2) + 500);

            promise.resolve(true);

        } catch (Exception e) {
            Log.e(TAG, "Failed to inject audio", e);
            promise.reject("INJECT_ERROR", e.getMessage());
        }
    }

    @ReactMethod
    public void playAudioFile(String filePath, Promise promise) {
        try {
            Log.d(TAG, "Playing audio file: " + filePath);

            File audioFile = new File(filePath);
            if (!audioFile.exists()) {
                promise.reject("FILE_NOT_FOUND", "Audio file not found: " + filePath);
                return;
            }

            audioManager.setMode(AudioManager.MODE_IN_CALL);
            audioManager.setSpeakerphoneOn(false);

            MediaPlayer mediaPlayer = new MediaPlayer();
            mediaPlayer.setAudioAttributes(
                new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                    .build()
            );

            mediaPlayer.setDataSource(filePath);
            mediaPlayer.prepare();
            
            mediaPlayer.setOnCompletionListener(mp -> {
                Log.d(TAG, "Playback completed");
                mp.release();
                audioManager.setMode(AudioManager.MODE_NORMAL);
            });

            mediaPlayer.setOnErrorListener((mp, what, extra) -> {
                Log.e(TAG, "MediaPlayer error: " + what + ", " + extra);
                mp.release();
                audioManager.setMode(AudioManager.MODE_NORMAL);
                return true;
            });

            mediaPlayer.start();
            promise.resolve(true);

        } catch (Exception e) {
            Log.e(TAG, "Failed to play audio file", e);
            audioManager.setMode(AudioManager.MODE_NORMAL);
            promise.reject("PLAYBACK_ERROR", e.getMessage());
        }
    }

    @ReactMethod
    public void hasActiveConnection(Promise promise) {
        try {
            int mode = audioManager.getMode();
            boolean inCall = (mode == AudioManager.MODE_IN_CALL || 
                            mode == AudioManager.MODE_IN_COMMUNICATION);
            promise.resolve(inCall);
        } catch (Exception e) {
            promise.reject("CHECK_ERROR", e.getMessage());
        }
    }

    @ReactMethod
    public void getConnectionState(Promise promise) {
        try {
            int mode = audioManager.getMode();
            String modeString;
            
            switch (mode) {
                case AudioManager.MODE_IN_CALL:
                    modeString = "IN_CALL";
                    break;
                case AudioManager.MODE_IN_COMMUNICATION:
                    modeString = "IN_COMMUNICATION";
                    break;
                case AudioManager.MODE_RINGTONE:
                    modeString = "RINGTONE";
                    break;
                default:
                    modeString = "NORMAL";
            }
            
            WritableMap state = Arguments.createMap();
            state.putString("mode", modeString);
            state.putInt("modeValue", mode);
            state.putBoolean("speakerOn", audioManager.isSpeakerphoneOn());
            state.putBoolean("micMuted", audioManager.isMicrophoneMute());
            
            promise.resolve(state);
        } catch (Exception e) {
            promise.reject("STATE_ERROR", e.getMessage());
        }
    }
}
```

## Registration

Add to `MainApplication.kt`:

```kotlin
import com.deepshetye.AIEPABX.AudioBridgeModule

override fun getReactNativeHost(): ReactNativeHost =
    object : DefaultReactNativeHost(this) {
        override fun getPackages(): List<ReactPackage> =
            PackageList(this).packages.apply {
                // Add the AudioBridgeModule package
                add(object : ReactPackage {
                    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
                        return listOf(AudioBridgeModule(reactContext))
                    }

                    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> {
                        return emptyList()
                    }
                })
            }
    }
```

## Permissions Required (AndroidManifest.xml)

```xml
<!-- Standard permissions -->
<uses-permission android:name="android.permission.RECORD_AUDIO" />
<uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />

<!-- Root/Magisk required permissions -->
<uses-permission android:name="android.permission.CAPTURE_AUDIO_OUTPUT" 
    tools:ignore="ProtectedPermissions" />
<uses-permission android:name="android.permission.MODIFY_PHONE_STATE"
    tools:ignore="ProtectedPermissions" />
```

## Usage from TypeScript

```typescript
import { NativeModules } from 'react-native';
const { AudioBridgeModule } = NativeModules;

// Initialize
await AudioBridgeModule.initialize({ sampleRate: 16000 });

// Inject audio (base64)
await AudioBridgeModule.injectAudio(base64AudioData);

// Or play file
await AudioBridgeModule.playAudioFile('/path/to/audio.mp3');
```
