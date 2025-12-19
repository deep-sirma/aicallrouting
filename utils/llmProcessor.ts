// Configuration - Set your API key here
const GEMINI_API_KEY = ''; // Set your Google Gemini API key
const GROQ_API_KEY = ''; // Alternative: Groq for Llama/Mixtral

export interface ConversationMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface LLMResponse {
  text: string;
  error?: string;
}

// Conversation history for context
let conversationHistory: ConversationMessage[] = [];

// System prompt for the AI assistant
const SYSTEM_PROMPT = `You are an AI phone assistant. You are currently on a phone call with the user.
Keep your responses:
- Brief and conversational (1-2 sentences max)
- Natural sounding for voice
- Helpful and friendly
- Don't use special characters, emojis, or formatting
- Speak as if you're having a phone conversation

If the user seems to be ending the call, respond appropriately with a brief goodbye.`;

/**
 * Generate AI response using configured LLM
 */
export async function generateResponse(userMessage: string): Promise<LLMResponse> {
  if (!userMessage.trim()) {
    return { text: '', error: 'Empty message' };
  }

  try {
    // Add user message to history
    conversationHistory.push({ role: 'user', content: userMessage });

    // Keep only last 10 messages for context
    if (conversationHistory.length > 10) {
      conversationHistory = conversationHistory.slice(-10);
    }

    // Try Gemini first
    if (GEMINI_API_KEY) {
      return await generateWithGemini(userMessage);
    }

    // Try Groq as fallback
    if (GROQ_API_KEY) {
      return await generateWithGroq(userMessage);
    }

    // No API configured
    console.log('No LLM API key configured');
    return {
      text: 'I heard you, but I am not configured to respond yet.',
      error: 'No API key configured. Set GEMINI_API_KEY or GROQ_API_KEY in llmProcessor.ts'
    };
  } catch (error) {
    console.error('LLM generation error:', error);
    return { text: '', error: String(error) };
  }
}

/**
 * Generate response using Google Gemini API
 */
async function generateWithGemini(userMessage: string): Promise<LLMResponse> {
  try {
    const contents = [
      {
        role: 'user',
        parts: [{ text: SYSTEM_PROMPT }]
      },
      ...conversationHistory.map(msg => ({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }]
      }))
    ];

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents,
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 150,
            topP: 0.9,
          },
          safetySettings: [
            { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
          ],
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    const text = result.candidates?.[0]?.content?.parts?.[0]?.text || '';

    // Add assistant response to history
    if (text) {
      conversationHistory.push({ role: 'assistant', content: text });
    }

    return { text };
  } catch (error) {
    console.error('Gemini error:', error);
    return { text: '', error: String(error) };
  }
}

/**
 * Generate response using Groq API (Llama/Mixtral)
 */
async function generateWithGroq(userMessage: string): Promise<LLMResponse> {
  try {
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...conversationHistory
    ];

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages,
        temperature: 0.7,
        max_tokens: 150,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Groq API error: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    const text = result.choices?.[0]?.message?.content || '';

    // Add assistant response to history
    if (text) {
      conversationHistory.push({ role: 'assistant', content: text });
    }

    return { text };
  } catch (error) {
    console.error('Groq error:', error);
    return { text: '', error: String(error) };
  }
}

/**
 * Clear conversation history (call this when a new call starts)
 */
export function clearConversationHistory(): void {
  conversationHistory = [];
  console.log('Conversation history cleared');
}

/**
 * Get current conversation history
 */
export function getConversationHistory(): ConversationMessage[] {
  return [...conversationHistory];
}
