package com.deepshetye.AIEPABX;

import android.content.Context;
import android.telecom.TelecomManager;
import android.telephony.PhoneStateListener;
import android.telephony.TelephonyManager;
import android.util.Log;
import android.os.Build;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.core.app.ActivityCompat;
import android.content.pm.PackageManager;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.modules.core.DeviceEventManagerModule;

/**
 * Native module for telephony operations
 * Detects incoming calls via PhoneStateListener and provides auto-answer
 * functionality
 */
public class TelephonyModule extends ReactContextBaseJavaModule {
    private static final String TAG = "TelephonyModule";
    private final ReactApplicationContext reactContext;
    private TelephonyManager telephonyManager;
    private PhoneStateListener phoneStateListener;

    public TelephonyModule(ReactApplicationContext reactContext) {
        super(reactContext);
        this.reactContext = reactContext;
    }

    @NonNull
    @Override
    public String getName() {
        return "TelephonyModule";
    }

    private void sendEvent(String eventName, @Nullable WritableMap params) {
        if (reactContext.hasActiveCatalystInstance()) {
            reactContext
                    .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                    .emit(eventName, params);
        }
    }

    /**
     * Start listening for call state changes
     */
    @ReactMethod
    public void startListener() {
        if (telephonyManager == null) {
            telephonyManager = (TelephonyManager) reactContext.getSystemService(Context.TELEPHONY_SERVICE);
        }

        if (phoneStateListener == null) {
            phoneStateListener = new PhoneStateListener() {
                @Override
                public void onCallStateChanged(int state, String phoneNumber) {
                    WritableMap params = Arguments.createMap();

                    int mappedState = 0; // IDLE
                    String stateStr = "IDLE";

                    switch (state) {
                        case TelephonyManager.CALL_STATE_RINGING:
                            mappedState = 1; // RINGING
                            stateStr = "RINGING";
                            Log.d(TAG, "🔔 Listener: RINGING (Incoming call)");
                            break;
                        case TelephonyManager.CALL_STATE_OFFHOOK:
                            mappedState = 2; // ACTIVE
                            stateStr = "OFFHOOK";
                            Log.d(TAG, "📱 Listener: OFFHOOK (Active call)");
                            break;
                        case TelephonyManager.CALL_STATE_IDLE:
                            mappedState = 0; // IDLE
                            stateStr = "IDLE";
                            Log.d(TAG, "⚪ Listener: IDLE");
                            break;
                    }

                    params.putInt("state", mappedState);
                    params.putString("stateStr", stateStr);
                    sendEvent("onCallStateChanged", params);
                }
            };

            // Register listener
            reactContext.runOnUiQueueThread(new Runnable() {
                @Override
                public void run() {
                    if (telephonyManager != null) {
                        telephonyManager.listen(phoneStateListener, PhoneStateListener.LISTEN_CALL_STATE);
                        Log.d(TAG, "✅ PhoneStateListener registered");
                    }
                }
            });
        }
    }

    /**
     * Stop listening
     */
    @ReactMethod
    public void stopListener() {
        if (telephonyManager != null && phoneStateListener != null) {
            telephonyManager.listen(phoneStateListener, PhoneStateListener.LISTEN_NONE);
            phoneStateListener = null;
            Log.d(TAG, "🛑 PhoneStateListener unregistered");
        }
    }

    /**
     * Get current call state (Polling backup)
     */
    @ReactMethod
    public void getCallState(Promise promise) {
        try {
            if (telephonyManager == null) {
                telephonyManager = (TelephonyManager) reactContext.getSystemService(Context.TELEPHONY_SERVICE);
            }

            // Permissions check omitted to avoid crash, assume handled in JS/Manifest
            int callState = telephonyManager.getCallState();
            int state = 0;

            switch (callState) {
                case TelephonyManager.CALL_STATE_RINGING:
                    state = 1;
                    break; // RINGING
                case TelephonyManager.CALL_STATE_OFFHOOK:
                    state = 2;
                    break; // ACTIVE
                default:
                    // Fallback check
                    TelecomManager tm = (TelecomManager) reactContext.getSystemService(Context.TELECOM_SERVICE);
                    if (tm != null && tm.isInCall())
                        state = 2;
                    break;
            }

            Log.d(TAG, "🔍 Polling State: " + state + " (Raw: " + callState + ")");
            promise.resolve(state);
        } catch (Exception e) {
            Log.e(TAG, "Error polling state", e);
            promise.resolve(0);
        }
    }

    @ReactMethod
    public void answerIncomingCall(Promise promise) {
        try {
            TelecomManager tm = (TelecomManager) reactContext.getSystemService(Context.TELECOM_SERVICE);
            if (tm != null) {
                if (ActivityCompat.checkSelfPermission(reactContext,
                        "android.permission.ANSWER_PHONE_CALLS") == PackageManager.PERMISSION_GRANTED) {
                    tm.acceptRingingCall();
                    Log.d(TAG, "✅ Answered via TelecomManager");
                    promise.resolve(true);
                } else {
                    Log.e(TAG, "❌ Missing ANSWER_PHONE_CALLS permission");
                    promise.reject("PERMISSION", "Missing permission");
                }
            } else {
                promise.resolve(false);
            }
        } catch (Exception e) {
            Log.e(TAG, "Answer failed", e);
            promise.reject("ERROR", e.getMessage());
        }
    }

    // Required for EventEmitter
    @ReactMethod
    public void addListener(String eventName) {
        // Keep: Required for RN built-in Event Emitter Calls.
    }

    @ReactMethod
    public void removeListeners(Integer count) {
        // Keep: Required for RN built-in Event Emitter Calls.
    }
}
