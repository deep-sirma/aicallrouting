import * as Speech from 'expo-speech';

export interface TTSOptions {
  language?: string;
  pitch?: number;
  rate?: number;
  voice?: string;
}

// Default TTS options
const defaultOptions: TTSOptions = {
  language: 'en-US',
  pitch: 1.0,
  rate: 1.0,
};

// Track if TTS is currently speaking
let isSpeaking = false;
let speechQueue: string[] = [];

/**
 * Speak text using expo-speech
 */
export async function speak(text: string, options?: TTSOptions): Promise<void> {
  if (!text.trim()) {
    console.log('TTS: Empty text, skipping');
    return;
  }

  const finalOptions = { ...defaultOptions, ...options };

  return new Promise((resolve, reject) => {
    // Clean text for TTS
    const cleanText = cleanTextForSpeech(text);
    console.log('TTS speaking:', cleanText);

    isSpeaking = true;

    Speech.speak(cleanText, {
      language: finalOptions.language,
      pitch: finalOptions.pitch,
      rate: finalOptions.rate,
      voice: finalOptions.voice,
      onStart: () => {
        console.log('TTS started');
        isSpeaking = true;
      },
      onDone: () => {
        console.log('TTS completed');
        isSpeaking = false;
        resolve();
      },
      onStopped: () => {
        console.log('TTS stopped');
        isSpeaking = false;
        resolve();
      },
      onError: (error) => {
        console.error('TTS error:', error);
        isSpeaking = false;
        reject(error);
      },
    });
  });
}

/**
 * Queue text to be spoken (waits for current speech to finish)
 */
export async function queueSpeak(text: string, options?: TTSOptions): Promise<void> {
  speechQueue.push(text);

  if (!isSpeaking) {
    await processQueue(options);
  }
}

/**
 * Process the speech queue
 */
async function processQueue(options?: TTSOptions): Promise<void> {
  while (speechQueue.length > 0) {
    const text = speechQueue.shift();
    if (text) {
      await speak(text, options);
    }
  }
}

/**
 * Stop any ongoing speech
 */
export function stopSpeaking(): void {
  Speech.stop();
  speechQueue = [];
  isSpeaking = false;
  console.log('TTS stopped and queue cleared');
}

/**
 * Check if TTS is currently speaking
 */
export function isCurrentlySpeaking(): boolean {
  return isSpeaking;
}

/**
 * Get available voices
 */
export async function getAvailableVoices(): Promise<Speech.Voice[]> {
  try {
    const voices = await Speech.getAvailableVoicesAsync();
    return voices;
  } catch (error) {
    console.error('Error getting voices:', error);
    return [];
  }
}

/**
 * Clean text for better TTS output
 */
function cleanTextForSpeech(text: string): string {
  return text
    // Remove markdown formatting
    .replace(/\*\*/g, '')
    .replace(/\*/g, '')
    .replace(/_/g, '')
    .replace(/`/g, '')
    // Remove URLs
    .replace(/https?:\/\/[^\s]+/g, 'link')
    // Remove special characters that don't translate well to speech
    .replace(/[#@&]/g, '')
    // Normalize whitespace
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Speak with interruption - stops current speech and speaks new text
 */
export async function speakWithInterrupt(text: string, options?: TTSOptions): Promise<void> {
  stopSpeaking();
  await speak(text, options);
}
