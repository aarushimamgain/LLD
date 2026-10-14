import { postJson } from './http.js';
import { LLMClient } from './llm-client.js';
import { LLMError, LLMErrorKind } from './llm-error.js';

const URL = 'https://api.openai.com/v1/chat/completions';
const DEFAULT_MODEL = 'gpt-4.1-mini';

/** OpenAI via the Chat Completions API over plain fetch. */
export class OpenAIClient extends LLMClient {
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
    return `openai:${this.#model}`;
  }

  async complete({ system, user }, { signal } = {}) {
    const data = await postJson(this.#fetch, URL, {
      provider: 'OpenAI',
      signal,
      headers: { authorization: `Bearer ${this.#apiKey}` },
      body: {
        model: this.#model,
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
        // JSON mode; the shape is checked with zod by the caller.
        response_format: { type: 'json_object' },
        temperature: 0.2,
      },
    });

    const choice = data.choices?.[0];
    if (choice?.message?.refusal) throw new LLMError(LLMErrorKind.REFUSED, `OpenAI refused: ${choice.message.refusal}`);
    if (choice?.finish_reason === 'length') throw new LLMError(LLMErrorKind.INVALID_RESPONSE, 'OpenAI reply was cut off');
    return choice?.message?.content ?? '';
  }
}
