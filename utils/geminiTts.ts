import { getGeminiProxyRequest } from '../services/supabaseClient';

function decodeBase64Audio(audioData: string): ArrayBuffer {
  const binaryAudio = atob(audioData);
  const audioBytes = new Uint8Array(binaryAudio.length);
  for (let i = 0; i < binaryAudio.length; i++) {
    audioBytes[i] = binaryAudio.charCodeAt(i);
  }
  return audioBytes.buffer;
}

export async function generateSpeech(text: string): Promise<ArrayBuffer> {
  const request = getGeminiProxyRequest({ task: 'speech', text, stream: false });
  const response = await fetch(request.url, {
    method: 'POST',
    headers: request.headers,
    body: request.body
  });
  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(`Speech generation failed: ${responseText || response.statusText}`);
  }

  let result: {
    output_audio?: { data?: string };
    steps?: Array<{ content?: Array<{ type?: string; data?: string }> }>;
  };
  try {
    result = JSON.parse(responseText);
  } catch {
    throw new Error(`Gemini TTS returned an invalid response: ${responseText || response.statusText}`);
  }

  let audioData = result.output_audio?.data;
  for (const step of result.steps || []) {
    for (const content of step.content || []) {
      if (content.type === 'audio' && content.data) audioData = content.data;
    }
  }
  if (!audioData) {
    throw new Error('Gemini TTS returned no audio data in its response steps.');
  }
  return decodeBase64Audio(audioData);
}

export async function generateSpeechStream(
  text: string,
  onAudioChunk: (chunk: ArrayBuffer) => void
): Promise<void> {
  const request = getGeminiProxyRequest({ task: 'speech', text, stream: true });
  const response = await fetch(request.url, {
    method: 'POST',
    headers: request.headers,
    body: request.body
  });
  if (!response.ok) {
    throw new Error(`Speech generation failed: ${await response.text()}`);
  }
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
