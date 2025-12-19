import * as FileSystem from 'expo-file-system/legacy';

// Configure your STT API key here
// Options: OpenAI Whisper API or Groq Whisper API
const OPENAI_API_KEY: string = ''; // Set your OpenAI API key
const GROQ_API_KEY: string = '';   // Or set your Groq API key (faster, free tier available)

export interface TranscriptionResult {
  text: string;
  error?: string;
}

/**
 * Transcribe audio file using Whisper API
 * Supports both OpenAI and Groq endpoints
 */
export async function transcribeWithWhisper(audioUri: string): Promise<TranscriptionResult> {
  console.log('========== STT TRANSCRIPTION ==========');
  console.log('Audio URI:', audioUri);

  // Check which API key is available
  const useGroq = GROQ_API_KEY && GROQ_API_KEY.length > 0;
  const useOpenAI = OPENAI_API_KEY && OPENAI_API_KEY.length > 0;

  if (!useGroq && !useOpenAI) {
    console.log('No STT API key configured. Audio saved at:', audioUri);
    console.log('==========================================');
    return {
      text: '[STT not configured - audio saved]',
      error: 'No API key configured. Set OPENAI_API_KEY or GROQ_API_KEY in sttProcessor.ts'
    };
  }

  try {
    // Read the audio file as base64
    const base64Audio = await FileSystem.readAsStringAsync(audioUri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    console.log('Audio base64 length:', base64Audio.length, 'chars');

    // Convert base64 to blob for FormData
    const binaryString = atob(base64Audio);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    const audioBlob = new Blob([bytes], { type: 'audio/m4a' });

    console.log('Audio blob size:', audioBlob.size, 'bytes');

    // Prepare FormData
    const formData = new FormData();
    formData.append('file', audioBlob, 'audio.m4a');
    formData.append('model', 'whisper-1');
    formData.append('language', 'en');

    // Choose endpoint and API key
    let endpoint: string;
    let apiKey: string;

    if (useGroq) {
      endpoint = 'https://api.groq.com/openai/v1/audio/transcriptions';
      apiKey = GROQ_API_KEY;
      formData.set('model', 'whisper-large-v3'); // Groq uses different model name
      console.log('Using Groq Whisper API');
    } else {
      endpoint = 'https://api.openai.com/v1/audio/transcriptions';
      apiKey = OPENAI_API_KEY;
      console.log('Using OpenAI Whisper API');
    }

    const startTime = Date.now();

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
      body: formData,
    });

    const responseTime = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`STT response time: ${responseTime}s`);
    console.log('STT status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.log('STT error:', errorText);
      console.log('==========================================');
      return {
        text: '',
        error: `STT API error: ${response.status} - ${errorText}`
      };
    }

    const result = await response.json();
    const transcription = result.text || '';

    console.log('Transcription:', transcription);
    console.log('==========================================');

    return { text: transcription };

  } catch (error) {
    console.error('STT error:', error);
    console.log('==========================================');
    return {
      text: '',
      error: `STT failed: ${error}`
    };
  }
}
