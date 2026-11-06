const allowedOrigins = new Set([
  'https://pdhiman97.github.io',
  'http://localhost:3000',
  'http://localhost:5173'
]);

const chatModels = ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-3.8-flash'];
const analysisModels = ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-3.8-flash'];
const speechModels = ['gemini-3.8-flash-lite-tts', 'gemini-3.1-flash-tts-preview'];

type JsonRecord = Record<string, unknown>;

function isRetryableStatus(status: number): boolean {
  return status === 404 || [408, 429, 500, 502, 503, 504].includes(status);
}

function corsHeaders(origin: string | null): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Headers': 'authorization, apikey, x-client-info, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin'
  };
}

function jsonResponse(body: JsonRecord, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' }
  });
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function postGeminiGenerate(
  apiKey: string,
  models: string[],
  contents: unknown[],
  config: JsonRecord
): Promise<Response> {
  let lastResponse: Response | undefined;
  for (const model of models) {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({ contents, generationConfig: config.generationConfig, systemInstruction: config.systemInstruction })
      }
    );
    if (response.ok || !isRetryableStatus(response.status) || model === models.at(-1)) {
      return response;
    }
    lastResponse = response;
    await response.body?.cancel();
  }
  if (!lastResponse) throw new Error('No Gemini models were configured.');
  return lastResponse;
}

async function generateText(
  apiKey: string,
  models: string[],
  contents: unknown[],
  config: JsonRecord
): Promise<string> {
  const response = await postGeminiGenerate(apiKey, models, contents, config);
  const result = await response.json() as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    error?: { message?: string };
  };
  if (!response.ok) {
    throw new Error(result.error?.message || `Gemini returned HTTP ${response.status}.`);
  }
  const text = result.candidates?.[0]?.content?.parts
    ?.map(part => part.text || '')
    .join('')
    .trim();
  if (!text) throw new Error('Gemini returned no text.');
  return text;
}

function buildSpeechRequest(text: string, stream: boolean): JsonRecord {
  return {
    input: [{
      type: 'user_input',
      content: [{ type: 'text', text }]
    }],
    response_format: { type: 'audio' },
    generation_config: { speech_config: [{ voice: 'Kore' }] },
    ...(stream ? { stream: true } : {})
  };
}

Deno.serve(async request => {
  const origin = request.headers.get('origin');
  const cors = corsHeaders(origin);

  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: cors });
  }
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed.' }, 405, cors);
  }
  if (origin && !allowedOrigins.has(origin)) {
    return jsonResponse({ error: 'Origin is not allowed.' }, 403, cors);
  }

  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) {
    console.error('GEMINI_API_KEY is not configured for the Edge Function.');
    return jsonResponse({ error: 'The Gemini service is not configured.' }, 500, cors);
  }

  let body: JsonRecord;
  try {
    const requestText = await request.text();
    if (new TextEncoder().encode(requestText).byteLength > 1_000_000) {
      return jsonResponse({ error: 'Request is too large.' }, 413, cors);
    }
    const parsed: unknown = JSON.parse(requestText);
    if (!isRecord(parsed)) throw new Error('Expected a JSON object.');
    body = parsed;
  } catch {
    return jsonResponse({ error: 'Invalid JSON request.' }, 400, cors);
  }

  try {
    if (body.task === 'chat') {
      if (typeof body.systemInstruction !== 'string' || body.systemInstruction.length > 30_000 ||
          !Array.isArray(body.contents) || body.contents.length === 0 || body.contents.length > 12) {
        return jsonResponse({ error: 'Invalid chat request.' }, 400, cors);
      }
      const text = await generateText(apiKey, chatModels, body.contents, {
        systemInstruction: { parts: [{ text: body.systemInstruction }] },
        generationConfig: { maxOutputTokens: 96 }
      });
      return jsonResponse({ text }, 200, cors);
    }

    if (body.task === 'analysis') {
      if (typeof body.prompt !== 'string' || body.prompt.length > 80_000 || !isRecord(body.responseSchema)) {
        return jsonResponse({ error: 'Invalid analysis request.' }, 400, cors);
      }
      const text = await generateText(apiKey, analysisModels, [{ parts: [{ text: body.prompt }] }], {
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: body.responseSchema,
          maxOutputTokens: 4096
        }
      });
      return jsonResponse({ text }, 200, cors);
    }

    if (body.task === 'speech') {
      if (typeof body.text !== 'string' || body.text.length === 0 || body.text.length > 4000 ||
          typeof body.stream !== 'boolean') {
        return jsonResponse({ error: 'Invalid speech request.' }, 400, cors);
      }

      let upstream: Response | undefined;
      for (const model of speechModels) {
        const result = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
          body: JSON.stringify({ model, ...buildSpeechRequest(body.text, body.stream) })
        });
        if (result.ok || !isRetryableStatus(result.status) || model === speechModels.at(-1)) {
          upstream = result;
          break;
        }
        await result.body?.cancel();
      }
      if (!upstream) throw new Error('Gemini TTS returned no response.');
      if (!upstream.ok) {
        const message = await upstream.text();
        return jsonResponse({ error: message || `Gemini TTS returned HTTP ${upstream.status}.` }, upstream.status, cors);
      }
      const headers = new Headers(cors);
      headers.set('Content-Type', upstream.headers.get('Content-Type') || 'application/json');
      headers.set('Cache-Control', 'no-store');
      return new Response(upstream.body, { status: upstream.status, headers });
    }

    if (body.task === 'transcription') {
      if (!isRecord(body.audio) || typeof body.audio.data !== 'string' || body.audio.data.length === 0 ||
          body.audio.data.length > 900_000 ||
          typeof body.audio.mimeType !== 'string' ||
          !['audio/webm', 'audio/ogg', 'audio/wav', 'audio/mpeg', 'audio/mp4'].includes(body.audio.mimeType)) {
        return jsonResponse({ error: 'Invalid audio transcription request.' }, 400, cors);
      }
      const text = await generateText(apiKey, chatModels, [{
        parts: [
          { inlineData: { mimeType: body.audio.mimeType, data: body.audio.data } },
          { text: 'Transcribe the spoken words exactly. Return only the transcript, with no labels or commentary.' }
        ]
      }], {
        generationConfig: { maxOutputTokens: 2048, temperature: 0 }
      });
      return jsonResponse({ text }, 200, cors);
    }

    return jsonResponse({ error: 'Unsupported task.' }, 400, cors);
  } catch (error) {
    console.error('Gemini proxy request failed:', error);
    const message = error instanceof Error ? error.message : 'Gemini request failed.';
    return jsonResponse({ error: message }, 502, cors);
  }
});
