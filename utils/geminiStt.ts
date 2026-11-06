import { getGeminiProxyRequest } from '../services/supabaseClient';
import { encode } from './audioUtils';

export async function transcribeAudio(audioBlob: Blob): Promise<string> {
  if (!audioBlob || audioBlob.size === 0) {
    throw new Error('No audio data recorded. Please try speaking again.');
  }
  if (audioBlob.size < 1000) {
    throw new Error('Audio recording is too short. Please speak for at least 1-2 seconds.');
  }

  const mimeType = audioBlob.type.split(';')[0] || 'audio/webm';
  const audioData = encode(new Uint8Array(await audioBlob.arrayBuffer()));
  const request = getGeminiProxyRequest({
    task: 'transcription',
    audio: { data: audioData, mimeType }
  });
  const response = await fetch(request.url, {
    method: 'POST',
    headers: request.headers,
    body: request.body
  });
  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(`Speech recognition failed: ${responseText || response.statusText}`);
  }

  let result: { text?: string };
  try {
    result = JSON.parse(responseText);
  } catch {
    throw new Error(`Speech recognition returned an invalid response: ${responseText || response.statusText}`);
  }
  if (typeof result.text !== 'string') {
    throw new Error('Speech recognition returned no transcript.');
  }
  return result.text;
}
