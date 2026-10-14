import { postJson } from './http.js';
import { LLMClient } from './llm-client.js';
import { LLMError, LLMErrorKind } from './llm-error.js';

const DEFAULT_MODEL = 'gemini-2.5-flash';

/** Gemini via the generateContent REST API over plain fetch. */
export class GeminiClient extends LLMClient {
  #apiKey;
  #model;
  #fetch;

  constructor({ apiKey, model = DEFAULT_MODEL, fetch = globalThis.fetch }) {
    super();
    this.#apiKey = apiKey;
    this.#model = model;
    this.#fetch = fetch;
  }

  get name() {
    return `gemini:${this.#model}`;
  }

  async complete({ system, user }, { signal } = {}) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.#model)}:generateContent`;
    const data = await postJson(this.#fetch, url, {
      provider: 'Gemini',
      signal,
      headers: { 'x-goog-api-key': this.#apiKey },
      body: {
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: user }] }],
        // JSON mode; the shape is checked with zod by the caller.
        generationConfig: { responseMimeType: 'application/json', temperature: 0.2 },
      },
    });

    if (data.promptFeedback?.blockReason) throw new LLMError(LLMErrorKind.REFUSED, `Gemini blocked the prompt: ${data.promptFeedback.blockReason}`);
    const candidate = data.candidates?.[0];
    if (candidate?.finishReason === 'SAFETY') throw new LLMError(LLMErrorKind.REFUSED, 'Gemini stopped for safety');
    if (candidate?.finishReason === 'MAX_TOKENS') throw new LLMError(LLMErrorKind.INVALID_RESPONSE, 'Gemini reply was cut off');
    return (candidate?.content?.parts ?? []).map((part) => part.text ?? '').join('');
  }
}
