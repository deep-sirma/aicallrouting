# Fixing TelephonyModule to Detect Incoming Calls

## The Problem

The app shows "IDLE" even when there's an incoming call because `TelephonyModule.getCallState()` only detects **active** calls, not **ringing** calls.

## The Fix

You need to update the native `TelephonyModule.java` file to properly detect incoming calls.

### Location
`android/app/src/main/java/com/deepshetye/AIEPABX/TelephonyModule.java`

### Required Changes

#### 1. Add Import
```java
import android.telecom.TelecomManager;
```

#### 2. Update or Replace getCallState() Method

Replace the existing `getCallState()` method with this improved version:

```java
@ReactMethod
public void getCallState(Promise promise) {
    try {
        TelephonyManager telephonyManager = (TelephonyManager) getReactApplicationContext()
                .getSystemService(Context.TELEPHONY_SERVICE);
        
        TelecomManager telecomManager = (TelecomManager) getReactApplicationContext()
                .getSystemService(Context.TELECOM_SERVICE);

        int state = 0; // Default: IDLE

        // Check TelecomManager first (more reliable for incoming calls)
        if (telecomManager != null && telecomManager.isRinging()) {
            state = 1; // RINGING
            Log.d(TAG, "📞 Incoming call detected via TelecomManager");
        } 
        // Check if there's an active call
        else if (telephonyManager != null) {
            int callState = telephonyManager.getCallState();
            
            switch (callState) {
                case TelephonyManager.CALL_STATE_RINGING:
                    state = 1; // RINGING
                    Log.d(TAG, "📞 Ringing state from TelephonyManager");
                    break;
                case TelephonyManager.CALL_STATE_OFFHOOK:
                    state = 2; // ACTIVE
                    Log.d(TAG, "📱 Active call state");
                    break;
                case TelephonyManager.CALL_STATE_IDLE:
                default:
                    state = 0; // IDLE
                    break;
            }
        }

        promise.resolve(state);
    } catch (Exception e) {
        Log.e(TAG, "Error getting call state", e);
        promise.resolve(0); // Return IDLE on error
    }
}
```

#### 3. Add Auto-Answer Method

While you're editing, add this method too:

```java
@ReactMethod
public void answerIncomingCall(Promise promise) {
    try {
        TelecomManager telecomManager = (TelecomManager) getReactApplicationContext()
                .getSystemService(Context.TELECOM_SERVICE);
        
        if (telecomManager != null && telecomManager.isRinging()) {
            telecomManager.acceptRingingCall();
            Log.d(TAG, "✅ Call auto-answered");
            promise.resolve(true);
        } else {
            Log.w(TAG, "⚠️ No ringing call to answer");
            promise.resolve(false);
        }
    } catch (SecurityException e) {
        Log.e(TAG, "❌ Permission denied", e);
        promise.reject("PERMISSION_DENIED", e.getMessage());
    } catch (Exception e) {
        Log.e(TAG, "❌ Failed to answer call", e);
        promise.reject("ERROR", e.getMessage());
    }
}
```

## After Making Changes

1. **Rebuild the app:**
   ```bash
   npx expo run:android --device
   ```

2. **Test again:**
   - Call your device
   - App should now show "INCOMING" state
   - Auto-answer should work
   - Logs will show: "📞 Incoming call detected via TelecomManager"

## Quick Test

After rebuilding, run:
```bash
adb logcat -c
adb logcat | grep -E "(📞|Incoming call|auto-answer|getCallState)"
```

Then call your device - you should see the detection happening!

## Alternative: Use PhoneStateListener (More Complex)

If the above doesn't work, you can implement a PhoneStateListener that actively monitors for call state changes, but the TelecomManager approach above should work with your existing permissions.
