/**
 * SIP Manager using react-native-sip2
 * Handles SIP registration and call routing for GSM-to-SIP bridging
 */

// Note: This will be available after running npm install
// @ts-ignore - module will be available after setup
import { Endpoint as SipEndpoint, Account, Call } from 'react-native-sip2';

export interface SipConfig {
    name: string;
    username: string;
    domain: string;
    password: string;
    proxy?: string | null;
    transport?: 'UDP' | 'TCP' | 'TLS' | null;
    regServer?: string | null;
    regTimeout?: number | null;
}

class SipManager {
    private endpoint: typeof SipEndpoint | null = null;
    private account: typeof Account | null = null;
    private currentCall: typeof Call | null = null;
    private isInitialized: boolean = false;
    private isRegistered: boolean = false;

    // Event callbacks
    private onRegisteredCallback?: (account: any) => void;
    private onUnregisteredCallback?: () => void;
    private onCallReceivedCallback?: (call: any) => void;
    private onCallConnectedCallback?: (call: any) => void;
    private onCallTerminatedCallback?: (call: any) => void;

    /**
     * Initialize SIP endpoint
     */
    async initialize(): Promise<boolean> {
        if (this.isInitialized) {
            console.log('SIP already initialized');
            return true;
        }

        try {
            console.log('========== SIP INIT ==========');

            this.endpoint = new SipEndpoint();

            // Start SIP endpoint
            const state = await this.endpoint.start();

            console.log('SIP endpoint started');
            console.log('Active accounts:', state.accounts?.length || 0);
            console.log('Active calls:', state.calls?.length || 0);
            console.log('Settings:', state.settings);

            // Set up event listeners
            this.setupEventListeners();

            this.isInitialized = true;
            console.log('==============================');

            return true;

        } catch (error) {
            console.error('Failed to initialize SIP:', error);
            console.log('==============================');
            return false;
        }
    }

    /**
     * Set up SIP event listeners
     */
    private setupEventListeners(): void {
        if (!this.endpoint) return;

        // Registration changed
        this.endpoint.on('registration_changed', (account: typeof Account) => {
            const registered = account.getRegistrationStatus() === 'REGISTERED';
            console.log('========== SIP REGISTRATION ==========');
            console.log('Status:', account.getRegistrationStatus());
            console.log('Registered:', registered);
            console.log('======================================');

            this.isRegistered = registered;

            if (registered) {
                this.onRegisteredCallback?.(account);
            } else {
                this.onUnregisteredCallback?.();
            }
        });

        // Connectivity changed
        this.endpoint.on('connectivity_changed', (online: boolean) => {
            console.log('SIP connectivity:', online ? 'Online' : 'Offline');
        });

        // Call received (incoming SIP call)
        this.endpoint.on('call_received', (call: typeof Call) => {
            console.log('========== SIP CALL RECEIVED ==========');
            console.log('From:', call.getRemoteNumber());
            console.log('Call ID:', call.getId());
            console.log('=======================================');

            this.currentCall = call;
            this.onCallReceivedCallback?.(call);
        });

        // Call state changed
        this.endpoint.on('call_changed', (call: typeof Call) => {
            const state = call.getState();
            console.log('SIP call state:', state);

            if (state === 'CONFIRMED') {
                console.log('SIP call connected');
                this.onCallConnectedCallback?.(call);
            }
        });

        // Call terminated
        this.endpoint.on('call_terminated', (call: typeof Call) => {
            console.log('========== SIP CALL TERMINATED ==========');
            console.log('Call ID:', call.getId());
            console.log('=========================================');

            this.onCallTerminatedCallback?.(call);

            if (this.currentCall?.getId() === call.getId()) {
                this.currentCall = null;
            }
        });

        // Call screen locked (Android only)
        this.endpoint.on('call_screen_locked', (locked: boolean) => {
            console.log('Screen locked (SIP):', locked);
        });
    }

    /**
     * Create and register SIP account
     */
    async createAccount(config: SipConfig): Promise<boolean> {
        if (!this.endpoint) {
            console.error('SIP endpoint not initialized');
            return false;
        }

        try {
            console.log('========== CREATE SIP ACCOUNT ==========');
            console.log('Username:', config.username);
            console.log('Domain:', config.domain);
            console.log('Transport:', config.transport || 'TCP');
            console.log('========================================');

            const accountConfig = {
                name: config.name,
                username: config.username,
                domain: config.domain,
                password: config.password,
                proxy: config.proxy || null,
                transport: config.transport || 'TCP',
                regServer: config.regServer || null,
                regTimeout: config.regTimeout || 3600,
                regHeaders: {},
                regContactParams: ''
            };

            this.account = await this.endpoint.createAccount(accountConfig);
            console.log('SIP account created successfully');

            return true;

        } catch (error) {
            console.error('Failed to create SIP account:', error);
            return false;
        }
    }

    /**
     * Make outgoing SIP call
     */
    async makeCall(destination: string, headers?: Record<string, string>): Promise<boolean> {
        if (!this.endpoint || !this.account) {
            console.error('SIP not ready: endpoint or account not available');
            return false;
        }

        if (!this.isRegistered) {
            console.error('SIP account not registered');
            return false;
        }

        try {
            console.log('========== MAKING SIP CALL ==========');
            console.log('Destination:', destination);
            console.log('=====================================');

            const options = {
                headers: headers || {}
            };

            this.currentCall = await this.endpoint.makeCall(
                this.account,
                destination,
                options
            );

            console.log('SIP call initiated, ID:', this.currentCall.getId());
            return true;

        } catch (error) {
            console.error('Failed to make SIP call:', error);
            return false;
        }
    }

    /**
     * Answer incoming SIP call
     */
    async answerCall(call?: typeof Call): Promise<boolean> {
        const targetCall = call || this.currentCall;

        if (!this.endpoint || !targetCall) {
            console.error('Cannot answer SIP call: no call available');
            return false;
        }

        try {
            console.log('Answering SIP call:', targetCall.getId());
            await this.endpoint.answerCall(targetCall);
            console.log('SIP call answered');
            return true;
        } catch (error) {
            console.error('Failed to answer SIP call:', error);
            return false;
        }
    }

    /**
     * Hangup SIP call
     */
    async hangupCall(call?: typeof Call): Promise<boolean> {
        const targetCall = call || this.currentCall;

        if (!this.endpoint || !targetCall) {
            console.error('Cannot hangup: no SIP call');
            return false;
        }

        try {
            console.log('Hanging up SIP call:', targetCall.getId());
            await this.endpoint.hangupCall(targetCall);
            this.currentCall = null;
            console.log('SIP call hung up');
            return true;
        } catch (error) {
            console.error('Failed to hangup SIP call:', error);
            return false;
        }
    }

    /**
     * Delete SIP account (unregister)
     */
    async deleteAccount(): Promise<boolean> {
        if (!this.endpoint || !this.account) {
            return false;
        }

        try {
            console.log('Deleting SIP account');
            await this.endpoint.deleteAccount(this.account);
            this.account = null;
            this.isRegistered = false;
            console.log('SIP account deleted');
            return true;
        } catch (error) {
            console.error('Failed to delete SIP account:', error);
            return false;
        }
    }

    /**
     * Get current SIP call
     */
    getCurrentCall(): typeof Call | null {
        return this.currentCall;
    }

    /**
     * Check if SIP is registered
     */
    isAccountRegistered(): boolean {
        return this.isRegistered;
    }

    /**
     * Check if SIP is ready
     */
    isReady(): boolean {
        return this.isInitialized && this.endpoint !== null;
    }

    /**
     * Set event callbacks
     */
    setCallbacks(callbacks: {
        onRegistered?: (account: any) => void;
        onUnregistered?: () => void;
        onCallReceived?: (call: any) => void;
        onCallConnected?: (call: any) => void;
        onCallTerminated?: (call: any) => void;
    }): void {
        this.onRegisteredCallback = callbacks.onRegistered;
        this.onUnregisteredCallback = callbacks.onUnregistered;
        this.onCallReceivedCallback = callbacks.onCallReceived;
        this.onCallConnectedCallback = callbacks.onCallConnected;
        this.onCallTerminatedCallback = callbacks.onCallTerminated;
    }

    /**
     * Cleanup
     */
    async shutdown(): Promise<void> {
        console.log('Shutting down SIP manager');

        if (this.currentCall) {
            await this.hangupCall();
        }

        if (this.account) {
            await this.deleteAccount();
        }

        this.endpoint = null;
        this.isInitialized = false;
        this.isRegistered = false;
    }
}

// Singleton instance
export const sipManager = new SipManager();
