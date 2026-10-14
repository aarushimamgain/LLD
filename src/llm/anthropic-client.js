import { postJson } from './http.js';
import { LLMClient } from './llm-client.js';
import { LLMError, LLMErrorKind } from './llm-error.js';

const URL = 'https://api.anthropic.com/v1/messages';
const DEFAULT_MODEL = 'claude-opus-5-5';

/** Claude via the Messages API over plain fetch. */
export class AnthropicClient extends LLMClient {
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
    return `anthropic:${this.#model}`;
  }

  async complete({ system, user, jsonSchema }, { signal } = {}) {
    const data = await postJson(this.#fetch, URL, {
      provider: 'Anthropic',
      signal,
      headers: {
        'x-api-key': this.#apiKey,
        'anthropic-version': '2023-06-01',
        // Server-side fallback: if a safety classifier declines, the API retries on a suitable model.
        'anthropic-beta': 'server-side-fallback-2026-07-01',
      },
      body: {
        model: this.#model,
        max_tokens: 16000,
        system,
        messages: [{ role: 'user', content: user }],
        output_config: {
          // Thinking is always on for this model; low effort keeps a review within seconds.
          effort: 'low',
          // Structured outputs: the reply is guaranteed to be JSON matching the schema.
          ...(jsonSchema ? { format: { type: 'json_schema', schema: jsonSchema } } : {}),
        },
        fallbacks: 'default',
      },
    });

    if (data.stop_reason === 'refusal') throw new LLMError(LLMErrorKind.REFUSED, 'Anthropic declined the request');
    if (data.stop_reason === 'max_tokens') throw new LLMError(LLMErrorKind.INVALID_RESPONSE, 'Anthropic reply was cut off at max_tokens');
    return (data.content ?? []).filter((block) => block.type === 'text').map((block) => block.text).join('');
  }
}
