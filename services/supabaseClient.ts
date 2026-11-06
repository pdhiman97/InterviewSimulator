import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();

let client: ReturnType<typeof createClient> | undefined;

function getConfiguration() {
  if (!supabaseUrl || !supabasePublishableKey) {
    throw new Error('Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.');
  }
  return { url: supabaseUrl, key: supabasePublishableKey };
}

function getClient() {
  const { url, key } = getConfiguration();
  client ??= createClient(url, key);
  return client;
}

export async function invokeGemini<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await getClient().functions.invoke<T>('gemini-proxy', { body });
  if (error) {
    throw new Error(`Gemini request failed: ${error.message}`);
  }
  if (data === null) {
    throw new Error('Gemini request returned an empty response.');
  }
  return data;
}

export function getGeminiProxyRequest(body: Record<string, unknown>): {
  url: string;
  headers: Record<string, string>;
  body: string;
} {
  const { url, key } = getConfiguration();
  return {
    url: `${url}/functions/v1/gemini-proxy`,
    headers: {
      'Content-Type': 'application/json',
      apikey: key,
      Authorization: `Bearer ${key}`
    },
    body: JSON.stringify(body)
  };
}
