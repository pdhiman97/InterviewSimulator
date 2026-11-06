import { generateWithGeminiFallback } from './geminiRetry';

const TTS_MODELS = ['gemini-3.8-flash-lite-tts', 'gemini-3.1-flash-tts-preview'] as const;

function getApiKey(): string {
  const apiKey = (
    import.meta.env.VITE_GEMINI_API_KEY ||
    process?.env?.GEMINI_API_KEY ||
    process?.env?.API_KEY
  )?.trim();

  if (!apiKey) {
    throw new Error('Gemini API key is not configured. Please set VITE_GEMINI_API_KEY in .env.local and restart the dev server.');
  }

  return apiKey;
}

function createRequest(text: string, model: string, stream: boolean) {
  return {
    model,
    input: [{
      type: 'user_input',
      content: [{
        type: 'text',
        text
      }]
    }],
    response_format: { type: 'audio' },
    generation_config: {
      speech_config: [{ voice: 'Kore' }]
    },
    ...(stream ? { stream: true } : {})
  };
}

async function postSpeechRequest(apiKey: string, model: string, body: object): Promise<Response> {
  const response = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const responseText = await response.text();
    let message = responseText || response.statusText;
    try {
      const result: { error?: { message?: string } } = JSON.parse(responseText);
      message = result.error?.message || message;
    } catch {
      // Keep the response text when the API does not return JSON.
    }
    throw new Error(`Gemini TTS API error: ${response.status} ${message}`);
  }

  return response;
}

function decodeBase64Audio(audioData: string): ArrayBuffer {
  const binaryAudio = atob(audioData);
  const audioBytes = new Uint8Array(binaryAudio.length);
  for (let i = 0; i < binaryAudio.length; i++) {
    audioBytes[i] = binaryAudio.charCodeAt(i);
  }
  return audioBytes.buffer;
}

export async function generateSpeech(text: string): Promise<ArrayBuffer> {
  const apiKey = getApiKey();
  return generateWithGeminiFallback(
    TTS_MODELS,
    async model => {
      const response = await postSpeechRequest(apiKey, model, createRequest(text, model, false));

      const responseText = await response.text();
      let result: {
        output_audio?: { data?: string };
        steps?: Array<{
          content?: Array<{
            type?: string;
            data?: string;
          }>;
        }>;
        error?: { message?: string };
      };
      try {
        result = JSON.parse(responseText);
      } catch {
        throw new Error(`Gemini TTS returned an invalid response: ${responseText || response.statusText}`);
      }

      if (!response.ok) {
        throw new Error(`Gemini TTS API error: ${response.status} ${result.error?.message || response.statusText}`);
      }

      let audioData = result.output_audio?.data;
      for (const step of result.steps || []) {
        for (const content of step.content || []) {
          if (content.type === 'audio' && content.data) {
            audioData = content.data;
          }
        }
      }
      if (!audioData) {
        throw new Error('Gemini TTS returned no audio data in its response steps.');
      }

      return decodeBase64Audio(audioData);
    }
  );
}

export async function generateSpeechStream(
  text: string,
  onAudioChunk: (chunk: ArrayBuffer) => void
): Promise<void> {
  const apiKey = getApiKey();
  const response = await generateWithGeminiFallback(
    TTS_MODELS,
    async model => {
      const result = await postSpeechRequest(apiKey, model, createRequest(text, model, true));
      if (!result.body) {
        throw new Error('Gemini TTS returned no streaming response body.');
      }
      return result;
    }
  );

  if (!response.body) {
    throw new Error('Gemini TTS returned no streaming response body.');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pendingLine = '';
  let audioChunkCount = 0;

  const handleLine = (line: string) => {
    if (!line.startsWith('data:')) return;
    const data = line.slice(5).trim();
    if (!data || data === '[DONE]') return;

    let event: {
      event_type?: string;
      delta?: { type?: string; data?: string };
    };
    try {
      event = JSON.parse(data);
    } catch {
      throw new Error('Gemini TTS returned an invalid streaming event.');
    }

    if (event.event_type === 'step.delta' && event.delta?.type === 'audio' && event.delta.data) {
      onAudioChunk(decodeBase64Audio(event.delta.data));
      audioChunkCount++;
    }
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      pendingLine += decoder.decode(value, { stream: !done });

      let newlineIndex = pendingLine.indexOf('\n');
      while (newlineIndex !== -1) {
        handleLine(pendingLine.slice(0, newlineIndex).trimEnd());
        pendingLine = pendingLine.slice(newlineIndex + 1);
        newlineIndex = pendingLine.indexOf('\n');
      }

      if (done) {
        if (pendingLine.trim()) handleLine(pendingLine.trimEnd());
        break;
      }
    }
  } finally {
    reader.releaseLock();
  }

  if (audioChunkCount === 0) {
    throw new Error('Gemini TTS completed without returning any audio chunks.');
  }
}
