import { AnthropicClient } from './anthropic-client.js';
import { GeminiClient } from './gemini-client.js';
import { MockLLMClient } from './mock-llm-client.js';
import { OpenAIClient } from './openai-client.js';

const PROVIDERS = {
  anthropic: AnthropicClient,
  gemini: GeminiClient,
  openai: OpenAIClient,
};

/**
 * Picks the LLM client from configuration. A missing key falls back to the mock (with a
 * warning) so the app always runs; an unknown provider name fails fast because it is a typo.
 * @param {Record<string, string | undefined>} env usually process.env (passed in by server.js)
 * @param {{warn: (message: string) => void}} [logger]
 * @returns {import('./llm-client.js').LLMClient}
 */
export function createLLMClient(env, logger = console) {
  const provider = (env.LLM_PROVIDER ?? '').trim().toLowerCase() || 'mock';
  const apiKey = env.LLM_API_KEY?.trim();
  const model = env.LLM_MODEL?.trim() || undefined;

  if (provider === 'mock') return new MockLLMClient();

  const Client = PROVIDERS[provider];
  if (!Client) {
    throw new Error(`Unknown LLM_PROVIDER "${provider}". Use one of: mock, ${Object.keys(PROVIDERS).join(', ')}.`);
  }
  if (!apiKey) {
    logger.warn(`[llm] LLM_PROVIDER=${provider} but LLM_API_KEY is empty: using the mock reviewer.`);
    return new MockLLMClient();
  }
  return new Client({ apiKey, model });
}
