import { jest } from '@jest/globals';
import { AnthropicClient } from '../../src/llm/anthropic-client.js';
import { createLLMClient } from '../../src/llm/create-llm-client.js';
import { GeminiClient } from '../../src/llm/gemini-client.js';
import { LLMErrorKind } from '../../src/llm/llm-error.js';
import { MockLLMClient } from '../../src/llm/mock-llm-client.js';
import { OpenAIClient } from '../../src/llm/openai-client.js';

const request = { system: 'sys', user: 'usr', jsonSchema: { type: 'object' } };

/** fetch stand-in that records the call and returns a canned response. */
function fakeFetch(body, status = 200) {
  return jest.fn(async () => ({ ok: status < 400, status, text: async () => JSON.stringify(body) }));
}

const sentBody = (fetch) => JSON.parse(fetch.mock.calls[0][1].body);
const sentHeaders = (fetch) => fetch.mock.calls[0][1].headers;

describe('AnthropicClient', () => {
  it('sends a Messages API request with structured output and fallbacks', async () => {
    const fetch = fakeFetch({ stop_reason: 'end_turn', content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: '{"items":[]}' }] });
    const reply = await new AnthropicClient({ apiKey: 'k', fetch }).complete(request);

    expect(reply).toBe('{"items":[]}');
    expect(fetch.mock.calls[0][0]).toBe('https://api.anthropic.com/v1/messages');
    expect(sentHeaders(fetch)).toMatchObject({ 'x-api-key': 'k', 'anthropic-version': '2023-06-01', 'anthropic-beta': 'server-side-fallback-2026-07-01' });
    expect(sentBody(fetch)).toMatchObject({
      model: 'claude-opus-5-5',
      system: 'sys',
      messages: [{ role: 'user', content: 'usr' }],
      output_config: { effort: 'low', format: { type: 'json_schema', schema: { type: 'object' } } },
      fallbacks: 'default',
    });
  });

  it('maps refusals and auth errors to LLMError kinds', async () => {
    await expect(new AnthropicClient({ apiKey: 'k', fetch: fakeFetch({ stop_reason: 'refusal', content: [] }) }).complete(request))
      .rejects.toMatchObject({ kind: LLMErrorKind.REFUSED });
    await expect(new AnthropicClient({ apiKey: 'bad', fetch: fakeFetch({ error: {} }, 401) }).complete(request))
      .rejects.toMatchObject({ kind: LLMErrorKind.AUTH });
  });
});

describe('GeminiClient', () => {
  it('requests JSON mode and joins text parts', async () => {
    const fetch = fakeFetch({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '{"items"' }, { text: ':[]}' }] } }] });
    const reply = await new GeminiClient({ apiKey: 'k', model: 'm1', fetch }).complete(request);

    expect(reply).toBe('{"items":[]}');
    expect(fetch.mock.calls[0][0]).toContain('/models/m1:generateContent');
    expect(sentHeaders(fetch)['x-goog-api-key']).toBe('k');
    expect(sentBody(fetch).generationConfig.responseMimeType).toBe('application/json');
  });

  it('maps rate limits', async () => {
    await expect(new GeminiClient({ apiKey: 'k', fetch: fakeFetch({}, 429) }).complete(request)).rejects.toMatchObject({ kind: LLMErrorKind.RATE_LIMITED });
  });
});

describe('OpenAIClient', () => {
  it('uses JSON mode and returns the message content', async () => {
    const fetch = fakeFetch({ choices: [{ finish_reason: 'stop', message: { content: '{"items":[]}' } }] });
    expect(await new OpenAIClient({ apiKey: 'k', fetch }).complete(request)).toBe('{"items":[]}');
    expect(sentHeaders(fetch).authorization).toBe('Bearer k');
    expect(sentBody(fetch).response_format).toEqual({ type: 'json_object' });
  });
});

describe('aborting', () => {
  it('reports an aborted request as a timeout', async () => {
    const controller = new AbortController();
    const fetch = jest.fn(() => {
      controller.abort();
      return Promise.reject(new DOMException('aborted', 'AbortError'));
    });
    await expect(new OpenAIClient({ apiKey: 'k', fetch }).complete(request, { signal: controller.signal }))
      .rejects.toMatchObject({ kind: LLMErrorKind.TIMEOUT });
  });
});

describe('MockLLMClient', () => {
  it('returns deterministic, labelled feedback about the submission in the prompt', async () => {
    const user = `<submission>\n${JSON.stringify({ entities: [{ name: 'Lot', responsibilities: ['a'], methods: [] }], keyFlows: 'x' })}\n</submission>`;
    const first = await new MockLLMClient().complete({ user });
    expect(first).toBe(await new MockLLMClient().complete({ user }));
    const { items } = JSON.parse(first);
    expect(items[0]).toMatchObject({ evidence: ['Lot'], message: expect.stringContaining('(Mock reviewer)') });
  });
});

describe('createLLMClient', () => {
  const logger = { warn: jest.fn() };
  beforeEach(() => logger.warn.mockClear());

  it.each([
    [{}, 'mock'],
    [{ LLM_PROVIDER: 'mock' }, 'mock'],
    [{ LLM_PROVIDER: 'Anthropic', LLM_API_KEY: 'k' }, 'anthropic:claude-opus-5-5'],
    [{ LLM_PROVIDER: 'gemini', LLM_API_KEY: 'k', LLM_MODEL: 'gemini-x' }, 'gemini:gemini-x'],
    [{ LLM_PROVIDER: 'openai', LLM_API_KEY: 'k' }, 'openai:gpt-4.1-mini'],
  ])('%j → %s', (env, name) => {
    expect(createLLMClient(env, logger).name).toBe(name);
  });

  it('falls back to the mock with a warning when the key is missing', () => {
    expect(createLLMClient({ LLM_PROVIDER: 'gemini' }, logger).name).toBe('mock');
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('LLM_API_KEY is empty'));
  });

  it('rejects unknown providers', () => {
    expect(() => createLLMClient({ LLM_PROVIDER: 'gpt' }, logger)).toThrow(/Unknown LLM_PROVIDER "gpt"/);
  });
});
