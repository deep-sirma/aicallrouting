# TelephonyModule - Auto-Answer Implementation Guide

## Current Status

The app now has auto-answer logic in `App.tsx`, but it requires updating the native `TelephonyModule.java` to add the `answerIncomingCall()` method.

## Required: Add to TelephonyModule.java

Since the Android directory is git-ignored, you need to manually add this method to:

`android/app/src/main/java/com/deepshetye/AIEPABX/TelephonyModule.java`

### Add This Import

```java
import android.telecom.TelecomManager;
```

### Add This Method to the TelephonyModule Class

```java
@ReactMethod
public void answerIncomingCall(Promise promise) {
    try {
        TelecomManager telecomManager = (TelecomManager) getReactApplicationContext()
                .getSystemService(Context.TELECOM_SERVICE);
        
        if (telecomManager != null) {
            // This requires ANSWER_PHONE_CALLS permission (already granted)
            telecomManager.acceptRingingCall();
            Log.d(TAG, "✅ Call answered via TelecomManager");
            promise.resolve(true);
        } else {
            promise.reject("ERROR", "TelecomManager not available");
        }
    } catch (SecurityException e) {
        Log.e(TAG, "❌ Permission denied for answering call", e);
        promise.reject("PERMISSION_DENIED", e.getMessage());
    } catch (Exception e) {
        Log.e(TAG, "❌ Failed to answer call", e);
        promise.reject("ERROR", e.getMessage());
    }
}
```

## Alternative: Quick Test Without Native Changes

If you want to test WITHOUT modifying the native code, you can use a simpler approach:

### Install react-native-phone-call-manager

```bash
npm install react-native-phone-call-manager
npx pod-install  # if iOS
```

### Or Use Intent-Based Auto-Answer (Android Only)

Add this to `TelephonyModule.java`:

```java
@ReactMethod
public void answerIncomingCall(Promise promise) {
    try {
        Intent intent = new Intent(Intent.ACTION_ANSWER);
        intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getReactApplicationContext().startActivity(intent);
        promise.resolve(true);
    } catch (Exception e) {
        promise.reject("ERROR", e.getMessage());
    }
}
```

## Rebuild After Adding

```bash
npx expo run:android --device
```

## Testing

1. Call your device from another phone
2. Watch the app auto-answer within 1-2 seconds
3. Check logs: `adb logcat | grep -E "(TelephonyModule|auto-answer)"`

## Fallback: Manual Answer Test

If auto-answer doesn't work immediately, you can manually answer the call to test the rest of the flow (AI processing, audio recording, etc.).

The auto-answer feature requires the native module update, but all other features (AI processing, recording, n8n integration) work as soon as the call becomes active.
