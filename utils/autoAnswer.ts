/**
 * Simple Auto-Answer Module
 * Uses the TelecomManager API to auto-answer incoming calls
 * Requires ANSWER_PHONE_CALLS permission (already granted)
 */

import { NativeModules } from 'react-native';

const { TelecomManager } = NativeModules;

export interface AutoAnswerManager {
    answerCall: () => Promise<boolean>;
    isCallRinging: () => Promise<boolean>;
}

/**
 * Auto-answer using Android TelecomManager
 * This works with the ANSWER_PHONE_CALLS permission we already have
 */
export const autoAnswer = {
    /**
     * Answer the incoming call
     * Uses the native acceptRingingCall() method
     */
    async answerCall(): Promise<boolean> {
        try {
            if (TelecomManager?.answerCall) {
                await TelecomManager.answerCall();
                console.log('✅ Call auto-answered via TelecomManager');
                return true;
            } else {
                console.warn('⚠️ TelecomManager.answerCall not available');
                return false;
            }
        } catch (error) {
            console.error('❌ Failed to auto-answer call:', error);
            return false;
        }
    },

    /**
     * Check if there's a ringing call
     */
    async isCallRinging(): Promise<boolean> {
        try {
            if (TelecomManager?.isRinging) {
                return await TelecomManager.isRinging();
            }
            return false;
        } catch (error) {
            console.error('Error checking if call is ringing:', error);
            return false;
        }
    }
};
