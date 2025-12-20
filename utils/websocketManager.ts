/**
 * WebSocket Manager for Real-time Audio Streaming
 * Handles bidirectional audio streaming between GSM calls and AI endpoint
 */

// WebSocket endpoint for AI audio streaming
const WEBSOCKET_URL = "ws://10.0.3.45:8000/api/v1/streaming/ws";

export interface AudioChunk {
    data: ArrayBuffer;
    timestamp: number;
    format: 'pcm' | 'opus' | 'mp3';
    sampleRate: number;
    channels: number;
}

export interface WebSocketMessage {
    type: 'audio' | 'transcription' | 'response' | 'control' | 'error' | 'connection_established' | 'input_audio_buffer.append';
    sessionId: string;
    data: any;
    timestamp: number;
}

class WebSocketManager {
    private ws: WebSocket | null = null;
    private sessionId: string | null = null;
    private isConnected: boolean = false;
    private reconnectAttempts: number = 0;
    private maxReconnectAttempts: number = 5;
    private reconnectDelay: number = 2000;

    private audioQueue: AudioChunk[] = [];
    private isProcessing: boolean = false;

    // Event callbacks
    private onConnectedCallback?: () => void;
    private onDisconnectedCallback?: () => void;
    private onTranscriptionCallback?: (text: string) => void;
    private onAudioResponseCallback?: (audioData: ArrayBuffer) => void;
    private onErrorCallback?: (error: string) => void;

    /**
     * Initialize WebSocket connection for a call session
     */
    async connect(sessionId: string): Promise<boolean> {
        this.sessionId = sessionId;

        return new Promise((resolve, reject) => {
            try {
                console.log('========== WEBSOCKET CONNECT ==========');
                console.log('URL:', WEBSOCKET_URL);
                console.log('Session ID:', sessionId);
                console.log('========================================');

                this.ws = new WebSocket(WEBSOCKET_URL);

                this.ws.onopen = () => {
                    console.log('WebSocket connected');
                    this.isConnected = true;
                    this.reconnectAttempts = 0;

                    // Backend sends connection_established, so we don't need to send init
                    // especially since it rejects type: 'control'

                    this.onConnectedCallback?.();
                    resolve(true);
                };

                this.ws.onmessage = (event) => {
                    this.handleMessage(event.data);
                };

                this.ws.onerror = (error) => {
                    console.error('WebSocket error:', error);
                    this.onErrorCallback?.('WebSocket connection error');
                    reject(error);
                };

                this.ws.onclose = () => {
                    console.log('WebSocket disconnected');
                    this.isConnected = false;
                    this.onDisconnectedCallback?.();

                    // Attempt reconnection if not manually closed
                    if (this.reconnectAttempts < this.maxReconnectAttempts) {
                        this.reconnectAttempts++;
                        setTimeout(() => {
                            console.log(`Reconnection attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);
                            this.connect(sessionId);
                        }, this.reconnectDelay);
                    }
                };

            } catch (error) {
                console.error('WebSocket connection failed:', error);
                reject(error);
            }
        });
    }

    /**
     * Send message to WebSocket server
     */
    private send(message: WebSocketMessage): void {
        if (!this.ws || !this.isConnected) {
            console.warn('WebSocket not connected, cannot send message');
            return;
        }

        try {
            this.ws.send(JSON.stringify(message));
        } catch (error) {
            console.error('Failed to send WebSocket message:', error);
        }
    }

    /**
     * Handle incoming WebSocket messages
     */
    private handleMessage(data: string | ArrayBuffer): void {
        try {
            // Handle binary audio data
            if (data instanceof ArrayBuffer) {
                console.log('Received audio data:', data.byteLength, 'bytes');
                this.onAudioResponseCallback?.(data);
                return;
            }

            // Handle JSON messages
            const message: WebSocketMessage = JSON.parse(data as string);

            console.log('WebSocket message:', message.type);

            switch (message.type) {
                case 'transcription':
                    console.log('Transcription:', message.data.text);
                    this.onTranscriptionCallback?.(message.data.text);
                    break;

                case 'response':
                    // AI response audio (might be base64 encoded)
                    if (message.data.audio) {
                        const audioBuffer = this.base64ToArrayBuffer(message.data.audio);
                        this.onAudioResponseCallback?.(audioBuffer);
                    }
                    break;

                case 'error':
                    console.error('Server error:', message.data);
                    this.onErrorCallback?.(message.data.message || 'Unknown error');
                    break;

                case 'control':
                    console.log('Control message:', message.data);
                    break;

                case 'connection_established':
                    console.log('Connection established:', message.data);
                    if (message.data?.sessionId) {
                        this.sessionId = message.data.sessionId;
                    }
                    this.onConnectedCallback?.();
                    break;

                default:
                    console.warn('Unknown message type:', message.type);
            }
        } catch (error) {
            console.error('Error handling WebSocket message:', error);
        }
    }

    /**
     * Send audio chunk to server for processing
     */
    async sendAudioChunk(audioChunk: AudioChunk): Promise<void> {
        if (!this.isConnected || !this.sessionId) {
            console.warn('Cannot send audio: not connected');
            return;
        }

        let base64Audio: string;
        if (typeof audioChunk.data === 'string') {
            base64Audio = audioChunk.data;
        } else {
            base64Audio = this.arrayBufferToBase64(audioChunk.data);
        }

        const message: WebSocketMessage = {
            type: 'input_audio_buffer.append',
            sessionId: this.sessionId,
            data: {
                audio: base64Audio,
                format: audioChunk.format,
                sampleRate: audioChunk.sampleRate,
                channels: audioChunk.channels,
                timestamp: audioChunk.timestamp
            },
            timestamp: Date.now()
        };

        console.log("📤 WEBSOCKET TX:", JSON.stringify({
            type: message.type,
            format: message.data.format,
            audioSize: base64Audio.length
        }));

        this.send(message);
    }

    /**
     * Stream audio continuously to server
     */
    startAudioStream(audioChunk: AudioChunk): void {
        this.audioQueue.push(audioChunk);

        if (!this.isProcessing) {
            this.processAudioQueue();
        }
    }

    /**
     * Process queued audio chunks
     */
    private async processAudioQueue(): Promise<void> {
        if (this.audioQueue.length === 0) {
            this.isProcessing = false;
            return;
        }

        this.isProcessing = true;
        const chunk = this.audioQueue.shift();

        if (chunk) {
            await this.sendAudioChunk(chunk);
        }

        // Continue processing queue
        setTimeout(() => this.processAudioQueue(), 50); // 50ms between chunks
    }

    /**
     * Disconnect WebSocket
     */
    disconnect(): void {
        console.log('Disconnecting WebSocket...');

        if (this.ws) {
            this.reconnectAttempts = this.maxReconnectAttempts; // Prevent reconnection

            // Send close message
            if (this.isConnected && this.sessionId) {
                this.send({
                    type: 'control',
                    sessionId: this.sessionId,
                    data: { action: 'close' },
                    timestamp: Date.now()
                });
            }

            this.ws.close();
            this.ws = null;
        }

        this.isConnected = false;
        this.sessionId = null;
        this.audioQueue = [];
        this.isProcessing = false;
    }

    /**
     * Check connection status
     */
    isConnectionActive(): boolean {
        return this.isConnected && this.ws !== null && this.ws.readyState === WebSocket.OPEN;
    }

    /**
     * Set event callbacks
     */
    setCallbacks(callbacks: {
        onConnected?: () => void;
        onDisconnected?: () => void;
        onTranscription?: (text: string) => void;
        onAudioResponse?: (audioData: ArrayBuffer) => void;
        onError?: (error: string) => void;
    }): void {
        this.onConnectedCallback = callbacks.onConnected;
        this.onDisconnectedCallback = callbacks.onDisconnected;
        this.onTranscriptionCallback = callbacks.onTranscription;
        this.onAudioResponseCallback = callbacks.onAudioResponse;
        this.onErrorCallback = callbacks.onError;
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
}

// Singleton instance
export const websocketManager = new WebSocketManager();
