package com.deepshetye.AIEPABX;

import android.content.Context;
import android.media.AudioAttributes;
import android.media.AudioFormat;
import android.media.AudioManager;
import android.media.AudioRecord;
import android.media.AudioTrack;
import android.media.MediaCodec;
import android.media.MediaExtractor;
import android.media.MediaFormat;
import android.media.MediaRecorder;
import com.facebook.react.modules.core.DeviceEventManagerModule;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.bridge.Arguments;
import android.os.Build;
import android.util.Base64;
import android.util.Log;

import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;

import java.io.File;
import java.io.FileOutputStream;
import java.nio.ByteBuffer;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Native module for injecting audio into the voice call stream.
 * 
 * Core Functionality:
 * 1. Switches audio mode to MODE_IN_COMMUNICATION
 * 2. Decodes MP3/Audio files to PCM 16-bit Mono
 * 3. Writes PCM data to AudioTrack (STREAM_VOICE_CALL)
 * 
 * This enables the caller on the GSM line to hear the AI response.
 */
public class CallAudioModule extends ReactContextBaseJavaModule {
    private static final String TAG = "CallAudioModule";
    private final ReactApplicationContext reactContext;
    private AudioTrack audioTrack;
    private ExecutorService executorService = Executors.newCachedThreadPool(); // Changed to Cached to allow concurrent
                                                                               // Record & Play
    private boolean isPlaying = false;
    private AudioRecord audioRecord;
    private boolean isRecording = false;
    private int recordBufferSize;

    public CallAudioModule(ReactApplicationContext reactContext) {
        super(reactContext);
        this.reactContext = reactContext;
    }

    @Override
    public String getName() {
        return "CallAudioModule";
    }

    /**
     * Sets the audio mode to IN_COMMUNICATION to route audio to the call stream.
     */
    @ReactMethod
    public void setCallAudioMode(Promise promise) {
        try {
            AudioManager audioManager = (AudioManager) reactContext.getSystemService(Context.AUDIO_SERVICE);
            if (audioManager != null) {
                // crucial step: claim audio focus and set mode
                audioManager.setMode(AudioManager.MODE_IN_COMMUNICATION);

                // Ensure speakerphone is off (route to earpiece/call stream)
                audioManager.setSpeakerphoneOn(false);

                Log.d(TAG, "✅ Audio Mode set to MODE_IN_COMMUNICATION");
                promise.resolve(true);
            } else {
                promise.reject("ERROR", "AudioManager not available");
            }
        } catch (Exception e) {
            Log.e(TAG, "Failed to set audio mode", e);
            promise.reject("ERROR", e.getMessage());
        }
    }

    /**
     * Resets audio mode to NORMAL
     */
    @ReactMethod
    public void resetAudioMode(Promise promise) {
        try {
            AudioManager audioManager = (AudioManager) reactContext.getSystemService(Context.AUDIO_SERVICE);
            if (audioManager != null) {
                audioManager.setMode(AudioManager.MODE_NORMAL);
                audioManager.setSpeakerphoneOn(true); // Default back to speaker for dev
                Log.d(TAG, "Audio Mode reset to NORMAL");
                promise.resolve(true);
            } else {
                promise.resolve(false);
            }
        } catch (Exception e) {
            promise.resolve(false);
        }
    }

    /**
     * Plays an audio file (MP3/WAV) directly into the call stream.
     * Use this instead of expo-av for AI responses.
     */
    @ReactMethod
    public void playAudioInCall(String filePath, Promise promise) {
        executorService.execute(() -> {
            try {
                Log.d(TAG, "Preparing to play in-call audio: " + filePath);
                // 1. Set mode just in case
                AudioManager audioManager = (AudioManager) reactContext.getSystemService(Context.AUDIO_SERVICE);
                reactContext.runOnUiQueueThread(() -> {
                    if (audioManager != null) {
                        try {
                            audioManager.setMode(AudioManager.MODE_IN_COMMUNICATION);
                            audioManager.setSpeakerphoneOn(false);
                        } catch (Exception e) {
                        }
                    }
                });

                // 2. Decode and Play
                playFileToStream(filePath);

                promise.resolve(true);
            } catch (Exception e) {
                Log.e(TAG, "Error playing audio in call", e);
                promise.reject("PLAY_ERROR", e.getMessage());
            }
        });
    }

    // Stream-specific AudioTrack
    private AudioTrack streamTrack;
    private boolean isStreaming = false;

    /**
     * Initialize AudioTrack for continuous PCM streaming
     * 
     * @param sampleRate Sample rate in Hz (e.g., 24000, 16000, 8000)
     */
    @ReactMethod
    public void startPCMStream(int sampleRate, Promise promise) {
        executorService.execute(() -> {
            try {
                if (isStreaming && streamTrack != null) {
                    promise.resolve(true); // Already started
                    return;
                }

                Log.d(TAG, "Starting PCM Stream at " + sampleRate + "Hz");

                // Ensure Audio Mode
                AudioManager audioManager = (AudioManager) reactContext.getSystemService(Context.AUDIO_SERVICE);
                reactContext.runOnUiQueueThread(() -> {
                    if (audioManager != null) {
                        audioManager.setMode(AudioManager.MODE_IN_COMMUNICATION);
                        audioManager.setSpeakerphoneOn(false);
                    }
                });

                int channelConfig = AudioFormat.CHANNEL_OUT_MONO;
                int audioFormat = AudioFormat.ENCODING_PCM_16BIT;
                int minBufferSize = AudioTrack.getMinBufferSize(sampleRate, channelConfig, audioFormat);

                // Use a larger buffer for streaming to avoid underruns
                int bufferSize = minBufferSize * 4;

                AudioAttributes audioAttributes = new AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                        .build();

                AudioFormat format = new AudioFormat.Builder()
                        .setSampleRate(sampleRate)
                        .setEncoding(audioFormat)
                        .setChannelMask(channelConfig)
                        .build();

                streamTrack = new AudioTrack(
                        audioAttributes,
                        format,
                        bufferSize,
                        AudioTrack.MODE_STREAM,
                        AudioManager.AUDIO_SESSION_ID_GENERATE);

                streamTrack.play();
                isStreaming = true;
                Log.d(TAG, "PCM Stream AudioTrack started");

                promise.resolve(true);
            } catch (Exception e) {
                Log.e(TAG, "Failed to start PCM stream", e);
                promise.reject("STREAM_ERROR", e.getMessage());
            }
        });
    }

    /**
     * Write a chunk of PCM data to the running stream
     * 
     * @param base64Data Base64 encoded PCM 16-bit audio data
     */
    @ReactMethod
    public void writePCMChunk(String base64Data, Promise promise) {
        if (!isStreaming || streamTrack == null) {
            promise.reject("STREAM_NOT_STARTED", "Audio stream not initialized. Call startPCMStream first.");
            return;
        }

        executorService.execute(() -> {
            try {
                byte[] pcmData = Base64.decode(base64Data, Base64.DEFAULT);
                if (pcmData != null && pcmData.length > 0) {
                    streamTrack.write(pcmData, 0, pcmData.length);
                }
                promise.resolve(true);
            } catch (Exception e) {
                Log.e(TAG, "Error writing PCM chunk", e);
                promise.reject("WRITE_ERROR", e.getMessage());
            }
        });
    }

    /**
     * Stop the PCM stream and release resources
     */
    @ReactMethod
    public void stopPCMStream(Promise promise) {
        isStreaming = false;
        executorService.execute(() -> {
            try {
                if (streamTrack != null) {
                    streamTrack.pause();
                    streamTrack.flush();
                    streamTrack.stop();
                    streamTrack.release();
                    streamTrack = null;
                }
                Log.d(TAG, "PCM Stream stopped");
                promise.resolve(true);
            } catch (Exception e) {
                Log.e(TAG, "Error stopping stream", e);
                promise.resolve(false);
            }
        });
    }

    /**
     * Start capturing PCM audio from the microphone (16000Hz, 16-bit, Mono)
     * and emit "onAudioChunk" events with base64 data.
     */
    @ReactMethod
    public void startRecordingPCM(Promise promise) {
        if (isRecording) {
            promise.resolve(true);
            return;
        }

        executorService.execute(() -> {
            try {
                int sampleRate = 16000;
                int channelConfig = AudioFormat.CHANNEL_IN_MONO;
                int audioFormat = AudioFormat.ENCODING_PCM_16BIT;

                recordBufferSize = AudioRecord.getMinBufferSize(sampleRate, channelConfig, audioFormat);
                if (recordBufferSize == AudioRecord.ERROR || recordBufferSize == AudioRecord.ERROR_BAD_VALUE) {
                    recordBufferSize = sampleRate * 2; // Fallback
                }

                // Use VOICE_COMMUNICATION for echo cancellation/noise suppression
                audioRecord = new AudioRecord(
                        MediaRecorder.AudioSource.VOICE_COMMUNICATION,
                        sampleRate,
                        channelConfig,
                        audioFormat,
                        recordBufferSize * 2);

                if (audioRecord.getState() != AudioRecord.STATE_INITIALIZED) {
                    promise.reject("INIT_ERROR", "AudioRecord initialization failed");
                    return;
                }

                audioRecord.startRecording();
                isRecording = true;
                Log.d(TAG, "🎤 AudioRecord started (PCM 16k)");
                promise.resolve(true);

                // Recording Loop
                byte[] buffer = new byte[1024 * 2]; // 2KB buffer (~64ms at 16k)
                while (isRecording) {
                    int bytesRead = audioRecord.read(buffer, 0, buffer.length);
                    if (bytesRead > 0) {
                        String base64Data = Base64.encodeToString(buffer, 0, bytesRead, Base64.NO_WRAP);
                        emitEvent("onAudioChunk", base64Data);
                    }
                }

                // Cleanup after loop
                if (audioRecord != null) {
                    try {
                        audioRecord.stop();
                        audioRecord.release();
                    } catch (Exception e) {
                        // ignore
                    }
                    audioRecord = null;
                }

            } catch (Exception e) {
                Log.e(TAG, "Error starting recording", e);
                isRecording = false;
                // If the promise is already resolved, we can't reject.
                // We rely on logs or a separate error event.
            }
        });
    }

    /**
     * Stop PCM recording
     */
    @ReactMethod
    public void stopRecordingPCM(Promise promise) {
        isRecording = false;
        // The loop in startRecordingPCM will exit and handle cleanup
        Log.d(TAG, "Stopping PCM Recording...");
        promise.resolve(true);
    }

    private void emitEvent(String eventName, String data) {
        try {
            if (reactContext.hasActiveCatalystInstance()) {
                reactContext
                        .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                        .emit(eventName, data);
            }
        } catch (Exception e) {
            Log.e(TAG, "Error emitting event: " + eventName, e);
        }
    }

    /**
     * Stop current file playback
     */
    @ReactMethod
    public void stopAudio() {
        isPlaying = false;
        if (audioTrack != null) {
            try {
                audioTrack.stop();
                audioTrack.release();
            } catch (Exception e) {
                // ignore
            }
            audioTrack = null;
        }
    }

    private void playFileToStream(String path) throws Exception {
        if (isPlaying)
            stopAudio();
        isPlaying = true;

        MediaExtractor extractor = new MediaExtractor();
        extractor.setDataSource(path);

        int trackIndex = -1;
        String mime = null;
        MediaFormat format = null;

        for (int i = 0; i < extractor.getTrackCount(); i++) {
            format = extractor.getTrackFormat(i);
            mime = format.getString(MediaFormat.KEY_MIME);
            if (mime.startsWith("audio/")) {
                trackIndex = i;
                break;
            }
        }

        if (trackIndex < 0) {
            throw new Exception("No audio track found in file");
        }

        extractor.selectTrack(trackIndex);
        MediaCodec codec = MediaCodec.createDecoderByType(mime);
        codec.configure(format, null, null, 0);
        codec.start();

        // Configure AudioTrack for VOICE_CALL
        // Standard for telephony is 8000Hz or 16000Hz Mono
        int sampleRate = format.containsKey(MediaFormat.KEY_SAMPLE_RATE)
                ? format.getInteger(MediaFormat.KEY_SAMPLE_RATE)
                : 16000;

        // Force 16kHz for better quality if possible, but 8kHz is standard GSM
        // Let's rely on the file's rate but ensure it matches track config

        int minBufferSize = AudioTrack.getMinBufferSize(
                sampleRate,
                AudioFormat.CHANNEL_OUT_MONO,
                AudioFormat.ENCODING_PCM_16BIT);

        AudioAttributes audioAttributes = new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION)
                .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                .build();

        AudioFormat audioFormat = new AudioFormat.Builder()
                .setSampleRate(sampleRate)
                .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                .build();

        audioTrack = new AudioTrack(
                audioAttributes,
                audioFormat,
                minBufferSize * 4,
                AudioTrack.MODE_STREAM,
                AudioManager.AUDIO_SESSION_ID_GENERATE);

        audioTrack.play();
        Log.d(TAG, "AudioTrack started on STREAM_VOICE_CALL");

        MediaCodec.BufferInfo info = new MediaCodec.BufferInfo();
        boolean inputDone = false;
        boolean outputDone = false;

        while (!outputDone && isPlaying) {
            if (!inputDone) {
                int inputIndex = codec.dequeueInputBuffer(10000);
                if (inputIndex >= 0) {
                    ByteBuffer buffer = codec.getInputBuffer(inputIndex);
                    int sampleSize = extractor.readSampleData(buffer, 0);
                    if (sampleSize < 0) {
                        codec.queueInputBuffer(inputIndex, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM);
                        inputDone = true;
                    } else {
                        codec.queueInputBuffer(inputIndex, 0, sampleSize, extractor.getSampleTime(), 0);
                        extractor.advance();
                    }
                }
            }

            int outputIndex = codec.dequeueOutputBuffer(info, 10000);
            if (outputIndex >= 0) {
                ByteBuffer buffer = codec.getOutputBuffer(outputIndex);
                if (buffer != null) {
                    byte[] chunk = new byte[info.size];
                    buffer.get(chunk);
                    buffer.clear();

                    if (chunk.length > 0) {
                        audioTrack.write(chunk, 0, chunk.length);
                    }
                }
                codec.releaseOutputBuffer(outputIndex, false);

                if ((info.flags & MediaCodec.BUFFER_FLAG_END_OF_STREAM) != 0) {
                    outputDone = true;
                }
            }
        }

        codec.stop();
        codec.release();
        extractor.release();

        // Don't release audio track immediately to avoid cutoff
        try {
            Thread.sleep(500);
        } catch (Exception e) {
        }
        isPlaying = false;
        Log.d(TAG, "Playback finished");
    }
}
