/**
 * Telephony Manager using react-native-tele
 * Handles GSM call reception, auto-answer, and call state management
 */

// Note: This will be available after running npm install
// @ts-ignore - module will be available after setup
import { Endpoint, Call } from 'react-native-tele';

export type CallState = 'idle' | 'incoming' | 'active' | 'held' | 'terminated';

export interface CallInfo {
    id: string;
    remoteNumber: string;
    state: CallState;
    startTime?: number;
    endTime?: number;
}

class TelephonyManager {
    private endpoint: typeof Endpoint | null = null;
    private currentCall: typeof Call | null = null;
    private isInitialized: boolean = false;
    private autoAnswerEnabled: boolean = true;

    // Event callbacks
    private onCallReceivedCallback?: (call: CallInfo) => void;
    private onCallConnectedCallback?: (call: CallInfo) => void;
    private onCallTerminatedCallback?: (call: CallInfo) => void;
    private onCallStateChangedCallback?: (call: CallInfo) => void;

    /**
     * Initialize the telephony endpoint
     */
    async initialize(): Promise<boolean> {
        if (this.isInitialized) {
            console.log('Telephony already initialized');
            return true;
        }

        try {
            console.log('========== TELEPHONY INIT ==========');

            this.endpoint = new Endpoint();

            // Start the telephony module
            const state = await this.endpoint.start({
                ReplaceDialer: false, // Don't replace default dialer
                Permissions: false // We handle permissions in App.tsx
            });

            console.log('Telephony endpoint started');
            console.log('Active calls:', state.calls?.length || 0);
            console.log('Settings:', state.settings);

            // Set up event listeners
            this.setupEventListeners();

            this.isInitialized = true;
            console.log('=====================================');

            return true;

        } catch (error) {
            console.error('Failed to initialize telephony:', error);
            console.log('=====================================');
            return false;
        }
    }

    /**
     * Set up event listeners for call events
     */
    private setupEventListeners(): void {
        if (!this.endpoint) return;

        // Call received event (incoming call)
        this.endpoint.on('call_received', (call: typeof Call) => {
            console.log('========== CALL RECEIVED ==========');
            console.log('From:', call.getRemoteNumber());
            console.log('Call ID:', call.getId());
            console.log('===================================');

            const callInfo = this.extractCallInfo(call);
            this.currentCall = call;

            this.onCallReceivedCallback?.(callInfo);

            // Auto-answer if enabled
            if (this.autoAnswerEnabled) {
                console.log('Auto-answering call...');
                this.answerCall(call);
            }
        });

        // Call state changed
        this.endpoint.on('call_changed', (call: typeof Call) => {
            const state = call.getState();
            console.log('Call state changed:', state);

            const callInfo = this.extractCallInfo(call);
            this.onCallStateChangedCallback?.(callInfo);

            // Check if call became active
            if (state === 'ACTIVE' || state === 'CONNECTED') {
                console.log('Call connected!');
                this.onCallConnectedCallback?.(callInfo);
            }
        });

        // Call terminated
        this.endpoint.on('call_terminated', (call: typeof Call) => {
            console.log('========== CALL TERMINATED ==========');
            console.log('Call ID:', call.getId());
            console.log('=====================================');

            const callInfo = this.extractCallInfo(call);
            this.onCallTerminatedCallback?.(callInfo);

            if (this.currentCall?.getId() === call.getId()) {
                this.currentCall = null;
            }
        });

        // Screen locked event (Android only)
        this.endpoint.on('call_screen_locked', (locked: boolean) => {
            console.log('Screen locked:', locked);
        });

        // Connectivity changed
        this.endpoint.on('connectivity_changed', (online: boolean) => {
            console.log('Connectivity changed:', online ? 'Online' : 'Offline');
        });
    }

    /**
     * Answer an incoming call
     */
    async answerCall(call?: typeof Call): Promise<boolean> {
        const targetCall = call || this.currentCall;

        if (!this.endpoint || !targetCall) {
            console.error('Cannot answer: no active call or endpoint');
            return false;
        }

        try {
            console.log('Answering call:', targetCall.getId());
            await this.endpoint.answerCall(targetCall);
            console.log('Call answered successfully');
            return true;
        } catch (error) {
            console.error('Failed to answer call:', error);
            return false;
        }
    }

    /**
     * Hangup current call
     */
    async hangupCall(call?: typeof Call): Promise<boolean> {
        const targetCall = call || this.currentCall;

        if (!this.endpoint || !targetCall) {
            console.error('Cannot hangup: no active call');
            return false;
        }

        try {
            console.log('Hanging up call:', targetCall.getId());
            await this.endpoint.hangupCall(targetCall);
            console.log('Call hung up');
            this.currentCall = null;
            return true;
        } catch (error) {
            console.error('Failed to hangup call:', error);
            return false;
        }
    }

    /**
     * Make an outgoing call (if needed)
     */
    async makeCall(phoneNumber: string, simSlot: number = 1): Promise<boolean> {
        if (!this.endpoint) {
            console.error('Telephony not initialized');
            return false;
        }

        try {
            console.log('Making call to:', phoneNumber);
            const call = await this.endpoint.makeCall(
                simSlot,
                phoneNumber,
                {}, // Call settings
                {}  // Message data
            );

            this.currentCall = call;
            console.log('Call initiated, ID:', call.getId());
            return true;
        } catch (error) {
            console.error('Failed to make call:', error);
            return false;
        }
    }

    /**
     * Hold current call
     */
    async holdCall(): Promise<boolean> {
        if (!this.endpoint || !this.currentCall) {
            console.error('No active call to hold');
            return false;
        }

        try {
            await this.endpoint.holdCall(this.currentCall);
            console.log('Call held');
            return true;
        } catch (error) {
            console.error('Failed to hold call:', error);
            return false;
        }
    }

    /**
     * Unhold call
     */
    async unholdCall(): Promise<boolean> {
        if (!this.endpoint || !this.currentCall) {
            console.error('No held call to unhold');
            return false;
        }

        try {
            await this.endpoint.unholdCall(this.currentCall);
            console.log('Call resumed');
            return true;
        } catch (error) {
            console.error('Failed to unhold call:', error);
            return false;
        }
    }

    /**
     * Mute/unmute microphone
     */
    async setMute(muted: boolean): Promise<boolean> {
        if (!this.endpoint || !this.currentCall) {
            console.error('No active call');
            return false;
        }

        try {
            if (muted) {
                await this.endpoint.muteCall(this.currentCall);
            } else {
                await this.endpoint.unmuteCall(this.currentCall);
            }
            console.log('Mute state:', muted);
            return true;
        } catch (error) {
            console.error('Failed to set mute:', error);
            return false;
        }
    }

    /**
     * Get current call information
     */
    getCurrentCall(): CallInfo | null {
        if (!this.currentCall) return null;
        return this.extractCallInfo(this.currentCall);
    }

    /**
     * Extract call information from Call object
     */
    private extractCallInfo(call: typeof Call): CallInfo {
        return {
            id: call.getId(),
            remoteNumber: call.getRemoteNumber(),
            state: this.mapCallState(call.getState()),
            startTime: Date.now() // You might want to track this more accurately
        };
    }

    /**
     * Map native call state to our CallState type
     */
    private mapCallState(nativeState: string): CallState {
        const stateMap: Record<string, CallState> = {
            'IDLE': 'idle',
            'RINGING': 'incoming',
            'ACTIVE': 'active',
            'CONNECTED': 'active',
            'HOLDING': 'held',
            'DISCONNECTED': 'terminated',
            'TERMINATED': 'terminated'
        };

        return stateMap[nativeState] || 'idle';
    }

    /**
     * Enable/disable auto-answer
     */
    setAutoAnswer(enabled: boolean): void {
        this.autoAnswerEnabled = enabled;
        console.log('Auto-answer:', enabled ? 'enabled' : 'disabled');
    }

    /**
     * Check if telephony is initialized
     */
    isReady(): boolean {
        return this.isInitialized && this.endpoint !== null;
    }

    /**
     * Set event callbacks
     */
    setCallbacks(callbacks: {
        onCallReceived?: (call: CallInfo) => void;
        onCallConnected?: (call: CallInfo) => void;
        onCallTerminated?: (call: CallInfo) => void;
        onCallStateChanged?: (call: CallInfo) => void;
    }): void {
        this.onCallReceivedCallback = callbacks.onCallReceived;
        this.onCallConnectedCallback = callbacks.onCallConnected;
        this.onCallTerminatedCallback = callbacks.onCallTerminated;
        this.onCallStateChangedCallback = callbacks.onCallStateChanged;
    }

    /**
     * Cleanup
     */
    shutdown(): void {
        console.log('Shutting down telephony manager');

        if (this.currentCall) {
            this.hangupCall();
        }

        this.endpoint = null;
        this.isInitialized = false;
        this.currentCall = null;
    }
}

// Singleton instance
export const telephonyManager = new TelephonyManager();
