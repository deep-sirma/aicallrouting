/**
 * Audio Bridge for GSM-to-WebSocket Audio Routing
 * Bridges audio between GSM calls and WebSocket endpoint for AI processing
 */

import { NativeModules, NativeEventEmitter } from 'react-native';
import { websocketManager, AudioChunk } from './websocketManager';
import { telephonyManager, CallInfo } from './telephonyManager';

// Native audio module (will be created)
const { AudioBridgeModule } = NativeModules;

export interface AudioBridgeConfig {
    sampleRate: number;
    channels: number;
    bitDepth: number;
    format: 'pcm' | 'opus' | 'mp3';
    chunkSizeMs: number; // Milliseconds per chunk
}

const DEFAULT_CONFIG: AudioBridgeConfig = {
    sampleRate: 16000, // 16kHz is good for speech
    channels: 1, // Mono
    bitDepth: 16,
    format: 'pcm',
    chunkSizeMs: 100 // 100ms chunks for low latency
};

class AudioBridge {
    private isActive: boolean = false;
    private config: AudioBridgeConfig = DEFAULT_CONFIG;
    private eventEmitter: NativeEventEmitter | null = null;
    private audioEventSubscription: any = null;

    private currentSessionId: string | null = null;
    private audioQueue: ArrayBuffer[] = [];

    /**
     * Initialize audio bridge
     */
    async initialize(config?: Partial<AudioBridgeConfig>): Promise<boolean> {
        this.config = { ...DEFAULT_CONFIG, ...config };

        console.log('========== AUDIO BRIDGE INIT ==========');
        console.log('Sample rate:', this.config.sampleRate);
        console.log('Channels:', this.config.channels);
        console.log('Format:', this.config.format);
        console.log('Chunk size:', this.config.chunkSizeMs, 'ms');
        console.log('=======================================');

        // Check if native module is available
        if (!AudioBridgeModule) {
            console.warn('AudioBridgeModule not available - using fallback');
            // We'll implement a fallback using expo-av recording
            return this.initializeFallback();
        }

        try {
            // Initialize native audio bridge
            await AudioBridgeModule.initialize(this.config);

            // Set up event emitter for audio chunks
            this.eventEmitter = new NativeEventEmitter(AudioBridgeModule);

            console.log('Audio bridge initialized successfully');
            return true;

        } catch (error) {
            console.error('Failed to initialize audio bridge:', error);
            return false;
        }
    }

    /**
     * Fallback initialization using expo-av
     */
    private async initializeFallback(): Promise<boolean> {
        console.log('Using fallback audio capture with expo-av');
        // The fallback will use the existing expo-av recording from App.tsx
        // We'll adapt it to stream to WebSocket instead of chunked files
        return true;
    }

    /**
     * Start audio bridging for a call
     */
    async startBridging(sessionId: string, call: CallInfo): Promise<boolean> {
        if (this.isActive) {
            console.warn('Audio bridge already active');
            return false;
        }

        this.currentSessionId = sessionId;
        this.isActive = true;

        console.log('========== START AUDIO BRIDGE ==========');
        console.log('Session ID:', sessionId);
        console.log('Call ID:', call.id);
        console.log('Remote number:', call.remoteNumber);
        console.log('========================================');

        try {
            // Connect WebSocket
            const wsConnected = await websocketManager.connect(sessionId);
            if (!wsConnected) {
                throw new Error('Failed to connect WebSocket');
            }

            // Start capturing GSM audio
            if (AudioBridgeModule) {
                await this.startNativeAudioCapture();
            } else {
                await this.startFallbackAudioCapture();
            }

            console.log('Audio bridging started successfully');
            return true;

        } catch (error) {
            console.error('Failed to start audio bridging:', error);
            this.isActive = false;
            return false;
        }
    }

    /**
     * Start native audio capture from call
     */
    private async startNativeAudioCapture(): Promise<void> {
        if (!AudioBridgeModule || !this.eventEmitter) {
            throw new Error('Native module not available');
        }

        // Subscribe to audio chunk events
        this.audioEventSubscription = this.eventEmitter.addListener(
            'onAudioChunk',
            (event: { data: string; timestamp: number }) => {
                // Audio data comes as base64 string
                const audioBuffer = this.base64ToArrayBuffer(event.data);

                const audioChunk: AudioChunk = {
                    data: audioBuffer,
                    timestamp: event.timestamp,
                    format: this.config.format,
                    sampleRate: this.config.sampleRate,
                    channels: this.config.channels
                };

                // Send to WebSocket
                websocketManager.sendAudioChunk(audioChunk);
            }
        );

        // Start capture on native side
        await AudioBridgeModule.startCapture();
        console.log('Native audio capture started');
    }

    /**
     * Start fallback audio capture using expo-av
     */
    private async startFallbackAudioCapture(): Promise<void> {
        // This will integrate with the existing expo-av recording in App.tsx
        // Instead of saving to files, we'll stream to WebSocket
        console.log('Fallback audio capture - will use existing recording mechanism');
        // The actual implementation will be in the App.tsx refactor
    }

    /**
     * Stop audio bridging
     */
    async stopBridging(): Promise<void> {
        if (!this.isActive) {
            return;
        }

        console.log('========== STOP AUDIO BRIDGE ==========');

        try {
            // Stop native audio capture
            if (AudioBridgeModule) {
                await AudioBridgeModule.stopCapture();

                if (this.audioEventSubscription) {
                    this.audioEventSubscription.remove();
                    this.audioEventSubscription = null;
                }
            }

            // Disconnect WebSocket
            websocketManager.disconnect();

            this.isActive = false;
            this.currentSessionId = null;
            this.audioQueue = [];

            console.log('Audio bridging stopped');
            console.log('=======================================');

        } catch (error) {
            console.error('Error stopping audio bridge:', error);
        }
    }

    /**
     * Inject AI response audio into GSM call
     */
    async injectAudio(audioData: ArrayBuffer): Promise<void> {
        if (!this.isActive) {
            console.warn('Cannot inject audio: bridge not active');
            return;
        }

        console.log('========== INJECT AUDIO ==========');
        console.log('Audio size:', audioData.byteLength, 'bytes');

        try {
            if (AudioBridgeModule) {
                // Convert to base64 for native module
                const base64Audio = this.arrayBufferToBase64(audioData);
                await AudioBridgeModule.injectAudio(base64Audio);
                console.log('Audio injected via native module');
            } else {
                // Fallback: play through speaker (existing mechanism)
                console.log('Using fallback audio playback');
                await this.fallbackInjectAudio(audioData);
            }

            console.log('==================================');

        } catch (error) {
            console.error('Failed to inject audio:', error);
        }
    }

    /**
     * Fallback audio injection (play through speaker)
     */
    private async fallbackInjectAudio(audioData: ArrayBuffer): Promise<void> {
        // This will use the existing playAudioFromBlob mechanism from n8nProcessor
        // We'll import and call it here
        const { playAudioFromBlob } = require('./n8nProcessor');
        await playAudioFromBlob(audioData);
    }

    /**
     * Check if bridge is active
     */
    isBridgeActive(): boolean {
        return this.isActive;
    }

    /**
     * Get current configuration
     */
    getConfig(): AudioBridgeConfig {
        return { ...this.config };
    }

    /**
     * Utility: Convert base64 to ArrayBuffer
     */
    private base64ToArrayBuffer(base64: string): ArrayBuffer {
        const binaryString = atob(base64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes.buffer;
    }

    /**
     * Utility: Convert ArrayBuffer to base64
     */
    private arrayBufferToBase64(buffer: ArrayBuffer): string {
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    }
}

// Singleton instance
export const audioBridge = new AudioBridge();
