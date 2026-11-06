function isTransientGeminiError(error: unknown): boolean {
  if (typeof error === 'object' && error !== null) {
    const status = (error as { status?: unknown; code?: unknown }).status ??
      (error as { code?: unknown }).code;
    if (
      (typeof status === 'number' && [408, 429, 500, 502, 503, 504].includes(status)) ||
      (typeof status === 'string' && /^(408|429|500|502|503|504|UNAVAILABLE|RESOURCE_EXHAUSTED)$/i.test(status))
    ) {
      return true;
    }
  }

  const message = error instanceof Error ? error.message : String(error);
  return /\b(408|429|500|502|503|504)\b|UNAVAILABLE|high demand|temporarily unavailable/i.test(message);
}

function isModelUnavailableError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /\b404\b|NOT_FOUND|model .{0,80}(not found|no longer available|unavailable)/i.test(message);
}

export async function retryGeminiRequest<T>(
  request: () => Promise<T>,
  maxRetries = 3
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await request();
    } catch (error) {
      if (attempt >= maxRetries || !isTransientGeminiError(error)) {
        throw error;
      }

      const delayMs = 1000 * 2 ** attempt;
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
}

export async function generateWithGeminiFallback<T>(
  models: readonly string[],
  request: (model: string) => Promise<T>
): Promise<T> {
  let lastError: unknown;

  for (let index = 0; index < models.length; index++) {
    const model = models[index];
    try {
      return await retryGeminiRequest(() => request(model), 0);
    } catch (error) {
      lastError = error;
      if ((!isTransientGeminiError(error) && !isModelUnavailableError(error)) || index === models.length - 1) {
        throw error;
      }

      const nextModel = models[index + 1];
      console.warn(`Gemini model "${model}" is unavailable; trying "${nextModel}".`);
    }
  }

  throw lastError;
}
