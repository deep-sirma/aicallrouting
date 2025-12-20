import * as FileSystem from 'expo-file-system/legacy';
import { Audio, InterruptionModeAndroid, InterruptionModeIOS } from 'expo-av';
import InCallManager from 'react-native-incall-manager';
import { NativeModules } from 'react-native';

// Native module for playing audio during calls
const { CallAudioModule } = NativeModules;

// n8n API Endpoints (same as your web app)
const API_ENDPOINTS = {
  main: "https://gpt1impacto.app.n8n.cloud/webhook/process-audio",
  interim: "https://gpt1impacto.app.n8n.cloud/webhook/interim-audio"
};

// Session management with 2-minute expiry
const SESSION_DURATION = 2 * 60 * 1000; // 2 minutes
let sessionId: string | null = null;
let sessionExpiry: number | null = null;

// Audio player reference
let currentSound: Audio.Sound | null = null;

export interface N8nResponse {
  success: boolean;
  error?: string;
}

/**
 * Get or create a session ID with 2-minute expiry
 */
export function getOrCreateSessionId(): string {
  const now = Date.now();

  if (!sessionId || !sessionExpiry || now > sessionExpiry) {
    sessionId = 'session_' + now + '_' + Math.random().toString(36).substr(2, 9);
    sessionExpiry = now + SESSION_DURATION;
    console.log('New session created:', sessionId, 'Expires in 2 minutes');
  } else {
    // Extend session expiry on activity
    sessionExpiry = now + SESSION_DURATION;
  }

  return sessionId;
}

/**
 * Reset session (call when a new phone call starts)
 */
export function resetSession(): void {
  sessionId = null;
  sessionExpiry = null;
  console.log('Session reset');
}

/**
 * Stop any currently playing audio
 */
export async function stopCurrentAudio(): Promise<void> {
  if (currentSound) {
    try {
      await currentSound.stopAsync();
      await currentSound.unloadAsync();
    } catch (e) {
      // Ignore errors
    }
    currentSound = null;
  }
}

/**
 * Play audio from a blob/arraybuffer
 * Uses native CallAudioModule to play through STREAM_VOICE_CALL
 */
async function playAudioFromBlob(audioData: ArrayBuffer): Promise<void> {
  try {
    // Stop any currently playing audio
    await stopCurrentAudio();

    console.log('========== NATIVE AUDIO PLAYBACK ==========');

    // Save audio to temp file
    // Use .mp3 extension as that's what we expect from n8n (usually)
    // Codec usage depends on header but extension helps debugging
    const tempFile = FileSystem.cacheDirectory + 'n8n_response_' + Date.now() + '.mp3';

    // Convert ArrayBuffer to base64
    const base64 = arrayBufferToBase64(audioData);

    await FileSystem.writeAsStringAsync(tempFile, base64, {
      encoding: FileSystem.EncodingType.Base64,
    });

    console.log('Audio file saved:', tempFile);
    console.log('Audio size:', audioData.byteLength, 'bytes');

    // Check if native module is available
    if (CallAudioModule?.playAudioInCall) {
      console.log('Using native CallAudioModule for in-call playback...');

      try {
        // Play audio using native module (plays through STREAM_VOICE_CALL)
        // This is a blocking call in our JS logic (waits for playback to start)
        // The native side runs on a thread
        console.log('Starting native audio playback...');

        // Ensure format is compatible (path string)
        // Remove file:// prefix if present as MediaExtractor expects path
        const cleanPath = tempFile.replace('file://', '');

        await CallAudioModule.playAudioInCall(cleanPath);
        console.log('Native audio playback started successfully');

        // Estimate duration based on size for logging (very rough: 32kbps MP3)
        // 32kbps = 4000 bytes/sec
        const estimatedDuration = audioData.byteLength / 4000;
        console.log(`Estimated duration: ${estimatedDuration.toFixed(1)}s`);

        // We resolve immediately after start, as native side handles the stream
        // But for sync logic, we might want to wait. 
        // For now, let's assume immediate return is fine for "Start Speaking"

        // Wait for estimated duration to prevent overlap? 
        // Better: let typical conversational turn-taking handle it.
        await new Promise(resolve => setTimeout(resolve, estimatedDuration * 1000));
        console.log('Playback duration wait completed');

        // Cleanup
        FileSystem.deleteAsync(tempFile, { idempotent: true }).catch(() => { });

      } catch (nativeError) {
        console.error('Native playback error:', nativeError);
        console.log('Falling back to expo-av playback...');
        await fallbackPlayAudio(tempFile, audioData.byteLength);
      }
    } else {
      console.log('CallAudioModule not available, using fallback...');
      await fallbackPlayAudio(tempFile, audioData.byteLength);
    }

    console.log('============================================');

  } catch (error) {
    console.error('Error playing audio:', error);
    throw error;
  }
}

/**
 * Fallback audio playback using expo-av (won't work during calls but useful for testing)
 */
async function fallbackPlayAudio(tempFile: string, size: number): Promise<void> {
  console.log('Fallback: Using expo-av playback');

  // Configure audio mode
  await Audio.setAudioModeAsync({
    allowsRecordingIOS: false,
    playsInSilentModeIOS: true,
    staysActiveInBackground: true,
    interruptionModeIOS: InterruptionModeIOS.DuckOthers,
    interruptionModeAndroid: InterruptionModeAndroid.DuckOthers,
    shouldDuckAndroid: true,
    playThroughEarpieceAndroid: false,
  });

  InCallManager.setForceSpeakerphoneOn(true);

  try {
    const { sound, status } = await Audio.Sound.createAsync(
      { uri: tempFile },
      { shouldPlay: true, volume: 1.0 }
    );

    currentSound = sound;
    console.log('Fallback sound loaded:', JSON.stringify(status));

    const duration = status.isLoaded ? status.durationMillis || 10000 : 10000;

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        console.log('Fallback playback timeout');
        sound.unloadAsync().catch(() => { });
        currentSound = null;
        FileSystem.deleteAsync(tempFile, { idempotent: true }).catch(() => { });
        resolve();
      }, duration + 2000);

      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          console.log('Fallback playback finished');
          clearTimeout(timeout);
          sound.unloadAsync();
          currentSound = null;
          FileSystem.deleteAsync(tempFile, { idempotent: true }).catch(() => { });
          resolve();
        }
      });
    });
  } catch (e) {
    console.error('Fallback playback error:', e);
    FileSystem.deleteAsync(tempFile, { idempotent: true }).catch(() => { });
  }
}

/**
 * Convert ArrayBuffer to base64
 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Send greeting request to n8n (called when call is answered)
 */
export async function sendGreeting(
  onStartSpeaking?: () => void,
  onEndSpeaking?: () => void
): Promise<N8nResponse> {
  const sessionId = getOrCreateSessionId();
  const requestBody = {
    question: "GREETING",
    type: "greeting",
    session_id: sessionId
  };

  console.log('========== GREETING REQUEST ==========');
  console.log('URL:', API_ENDPOINTS.main);
  console.log('Method: POST');
  console.log('Headers:', { "Content-Type": "application/json" });
  console.log('Body:', JSON.stringify(requestBody, null, 2));
  console.log('Session ID:', sessionId);
  console.log('=======================================');

  try {
    const startTime = Date.now();
    const response = await fetch(API_ENDPOINTS.main, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody)
    });

    const responseTime = Date.now() - startTime;
    console.log('========== GREETING RESPONSE ==========');
    console.log('Status:', response.status, response.statusText);
    console.log('Response time:', responseTime, 'ms');
    console.log('Headers:', JSON.stringify(Object.fromEntries(response.headers.entries())));

    if (!response.ok) {
      const errorText = await response.text();
      console.log('Error body:', errorText);
      console.log('========================================');
      throw new Error(`Server error: ${response.status} - ${errorText}`);
    }

    const contentType = response.headers.get('content-type');
    console.log('Content-Type:', contentType);

    const audioData = await response.arrayBuffer();
    console.log('Audio data size:', audioData.byteLength, 'bytes');
    console.log('========================================');

    if (audioData.byteLength === 0) {
      throw new Error('Empty audio response');
    }

    console.log('Playing greeting audio...');
    onStartSpeaking?.();
    await playAudioFromBlob(audioData);
    console.log('Greeting audio playback complete');
    onEndSpeaking?.();

    return { success: true };
  } catch (error) {
    console.error('========== GREETING ERROR ==========');
    console.error('Error:', error);
    console.error('====================================');
    onEndSpeaking?.();
    return { success: false, error: String(error) };
  }
}

/**
 * Send transcribed text to n8n and play response
 * Uses dual-endpoint strategy for faster response (interim + main)
 */
export async function sendToN8n(
  text: string,
  onStartSpeaking?: () => void,
  onEndSpeaking?: () => void
): Promise<N8nResponse> {
  if (!text.trim()) {
    console.log('sendToN8n: Empty text, skipping');
    return { success: false, error: 'Empty text' };
  }

  const sessionId = getOrCreateSessionId();
  const startTime = Date.now();

  console.log('========== N8N TEXT REQUEST ==========');
  console.log('Text:', text);
  console.log('Session ID:', sessionId);
  console.log('Calling both endpoints in parallel...');
  console.log('=======================================');

  try {
    // Track interim audio state
    let interimFinished = false;
    let mainAudioData: ArrayBuffer | null = null;

    // Interim request body
    const interimBody = {
      question: text,
      session_id: sessionId
    };

    // Main request body
    const mainBody = {
      question: text,
      type: "text",
      session_id: sessionId
    };

    console.log('---------- INTERIM REQUEST ----------');
    console.log('URL:', API_ENDPOINTS.interim);
    console.log('Body:', JSON.stringify(interimBody, null, 2));
    console.log('-------------------------------------');

    console.log('---------- MAIN REQUEST ----------');
    console.log('URL:', API_ENDPOINTS.main);
    console.log('Body:', JSON.stringify(mainBody, null, 2));
    console.log('----------------------------------');

    // Call BOTH endpoints in parallel for instant feedback
    const interimPromise = fetch(API_ENDPOINTS.interim, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(interimBody)
    }).then(async (response) => {
      const interimTime = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log('---------- INTERIM RESPONSE ----------');
      console.log(`Time: ${interimTime}s`);
      console.log('Status:', response.status, response.statusText);

      if (response.ok) {
        const audioData = await response.arrayBuffer();
        console.log('Audio size:', audioData.byteLength, 'bytes');
        console.log('--------------------------------------');

        if (audioData.byteLength > 0) {
          console.log('Playing interim audio...');
          onStartSpeaking?.();
          await playAudioFromBlob(audioData);
          console.log('Interim audio playback complete');
        }
      } else {
        const errorText = await response.text();
        console.log('Error:', errorText);
        console.log('--------------------------------------');
      }
      interimFinished = true;

      // If main audio is ready, play it
      if (mainAudioData) {
        console.log('Main audio ready, playing now');
        await playAudioFromBlob(mainAudioData);
        onEndSpeaking?.();
      }
    }).catch(err => {
      console.error('---------- INTERIM ERROR ----------');
      console.error('Error:', err);
      console.error('-----------------------------------');
      interimFinished = true;
    });

    // Main AI response
    const mainResponse = await fetch(API_ENDPOINTS.main, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(mainBody)
    });

    const mainTime = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log('---------- MAIN RESPONSE ----------');
    console.log(`Time: ${mainTime}s`);
    console.log('Status:', mainResponse.status, mainResponse.statusText);

    if (!mainResponse.ok) {
      const errorText = await mainResponse.text();
      console.log('Error:', errorText);
      console.log('-----------------------------------');
      throw new Error(`Server error: ${mainResponse.status} - ${errorText}`);
    }

    mainAudioData = await mainResponse.arrayBuffer();
    console.log('Audio size:', mainAudioData.byteLength, 'bytes');
    console.log('-----------------------------------');

    if (mainAudioData.byteLength === 0) {
      throw new Error('Empty audio response');
    }

    // If interim already finished, play main audio immediately
    if (interimFinished) {
      console.log('Interim finished, playing main audio');
      onStartSpeaking?.();
      await playAudioFromBlob(mainAudioData);
      onEndSpeaking?.();
    } else {
      console.log('Waiting for interim to finish...');
      // Wait for interim promise to complete (it will play main audio)
      await interimPromise;
    }

    const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log('========== N8N COMPLETE ==========');
    console.log(`Total time: ${totalTime}s`);
    console.log('==================================');

    return { success: true };
  } catch (error) {
    console.error('========== N8N ERROR ==========');
    console.error('Error:', error);
    console.error('===============================');
    onEndSpeaking?.();
    return { success: false, error: String(error) };
  }
}

/**
 * Send audio file to n8n for processing
 * This converts audio to text via n8n's STT, then gets AI response
 */
export async function sendAudioToN8n(
  audioUri: string,
  onStartSpeaking?: () => void,
  onEndSpeaking?: () => void,
  onTranscription?: (text: string) => void
): Promise<N8nResponse> {
  const startTime = Date.now();

  try {
    // Read audio file as base64
    const base64Audio = await FileSystem.readAsStringAsync(audioUri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    const sessionId = getOrCreateSessionId();

    console.log('========== AUDIO TO N8N ==========');
    console.log('Audio URI:', audioUri);
    console.log('Base64 length:', base64Audio.length, 'chars');
    console.log('Session ID:', sessionId);
    console.log('URL:', API_ENDPOINTS.main);
    console.log('===================================');

    // Send audio to n8n for transcription + AI response
    const response = await fetch(API_ENDPOINTS.main, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        audio: base64Audio,
        audio_format: "m4a",
        type: "audio",
        session_id: sessionId
      })
    });

    const responseTime = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log('========== N8N AUDIO RESPONSE ==========');
    console.log(`Response time: ${responseTime}s`);
    console.log('Status:', response.status, response.statusText);
    console.log('Content-Type:', response.headers.get('content-type'));
    console.log('=========================================');

    if (!response.ok) {
      const errorText = await response.text();
      console.log('Error response:', errorText);
      throw new Error(`Server error: ${response.status} - ${errorText}`);
    }

    // Check content type - might be JSON with transcription or audio
    const contentType = response.headers.get('content-type') || '';

    if (contentType.includes('audio')) {
      // Direct audio response (audio/mpeg, audio/mp3, etc.)
      const audioData = await response.arrayBuffer();
      console.log('Direct audio response:', audioData.byteLength, 'bytes');

      if (audioData.byteLength === 0) {
        console.log('Empty audio response - no speech detected?');
        return { success: true }; // Not an error, just no response needed
      }

      onStartSpeaking?.();
      await playAudioFromBlob(audioData);
      onEndSpeaking?.();

    } else if (contentType.includes('application/json')) {
      // JSON response with transcription and/or audio
      const responseText = await response.text();
      console.log('JSON response (first 500 chars):', responseText.substring(0, 500));

      if (!responseText || responseText.trim() === '') {
        console.log('Empty JSON response');
        return { success: true };
      }

      const jsonResponse = JSON.parse(responseText);

      if (jsonResponse.transcription) {
        console.log('Transcription:', jsonResponse.transcription);
        onTranscription?.(jsonResponse.transcription);
      }

      if (jsonResponse.audio) {
        // Audio is base64 encoded in JSON
        console.log('Audio in JSON, base64 length:', jsonResponse.audio.length);
        const audioBuffer = base64ToArrayBuffer(jsonResponse.audio);
        onStartSpeaking?.();
        await playAudioFromBlob(audioBuffer);
        onEndSpeaking?.();
      }

    } else {
      // Unknown content type - try to read as text for debugging
      const responseText = await response.text();
      console.log('Unknown content type response (first 200 chars):', responseText.substring(0, 200));

      if (responseText && responseText.length > 0) {
        // Maybe it's audio without proper content-type
        console.log('Treating as potential audio data...');
      }
    }

    return { success: true };
  } catch (error) {
    console.error('Audio processing error:', error);
    onEndSpeaking?.();
    return { success: false, error: String(error) };
  }
}

/**
 * Convert base64 to ArrayBuffer
 */
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}
