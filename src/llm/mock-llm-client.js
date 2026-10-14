import { LLMClient } from './llm-client.js';
import { LLMError, LLMErrorKind } from './llm-error.js';

const LABEL = '(Mock reviewer)';

/**
 * Deterministic stand-in for a real model, used when no API key is configured and in tests.
 * It reads the submission out of the prompt and returns plausible, clearly labelled feedback.
 * `behavior` simulates failures so the fallback paths can be tested and demoed:
 *   ok | invalid-json | invalid-once | error | hang
 */
export class MockLLMClient extends LLMClient {
  #behavior;
  #delayMs;
  #calls = 0;

  constructor({ behavior = 'ok', delayMs = 0 } = {}) {
    super();
    this.#behavior = behavior;
    this.#delayMs = delayMs;
  }

  get name() {
    return 'mock';
  }

  get calls() {
    return this.#calls;
  }

  async complete({ user }, { signal } = {}) {
    this.#calls++;
    await wait(this.#delayMs, signal);

    switch (this.#behavior) {
      case 'error':
        throw new LLMError(LLMErrorKind.PROVIDER, 'Mock provider error');
      case 'hang':
        return new Promise((_, reject) => {
          signal?.addEventListener('abort', () => reject(new LLMError(LLMErrorKind.TIMEOUT, 'Mock request aborted')));
        });
      case 'invalid-json':
        return 'Here is my review: the design looks good overall!';
      case 'invalid-once':
        if (this.#calls === 1) return '{"items": [{"dimension": "vibes"}]}';
        break;
    }
    return JSON.stringify({ items: review(extractSubmission(user)) });
  }
}

function review(submission) {
  const entities = submission.entities ?? [];
  const items = [];

  const central = [...entities].sort((a, b) => weight(b) - weight(a))[0];
  if (central) {
    items.push({
      dimension: 'responsibilities',
      severity: 'info',
      message: `${LABEL} ${central.name} is the centre of this design (${weight(central)} responsibilities and methods).`,
      evidence: [central.name],
      suggestion: `Check that each method on ${central.name} coordinates other objects rather than doing their work itself.`,
    });
  }

  const pattern = (submission.patterns ?? []).find((p) => p.why && entities.some((e) => e.name === p.where));
  if (pattern) {
    items.push({
      dimension: 'patternsAndTradeoffs',
      severity: 'suggestion',
      message: `${LABEL} The reason for ${pattern.name} at ${pattern.where} names a benefit but not a cost.`,
      evidence: [pattern.where],
      suggestion: `Add what ${pattern.name} costs here (extra classes, indirection) and the simpler alternative you rejected.`,
    });
  }

  if (submission.keyFlows) {
    items.push({
      dimension: 'requirementsCoverage',
      severity: 'suggestion',
      message: `${LABEL} The key flows describe the happy path but not what happens when a step fails.`,
      evidence: ['keyFlows'],
      suggestion: 'Add one failure path per flow, e.g. resource unavailable, invalid input or a cancelled operation.',
    });
  }
  return items;
}

function weight(entity) {
  return (entity.responsibilities?.length ?? 0) + (entity.methods?.length ?? 0);
}

/** The prompt embeds the submission between <submission> tags (see llm-prompt.js). */
function extractSubmission(prompt) {
  const match = /<submission>\s*([\s\S]*?)\s*<\/submission>/.exec(prompt ?? '');
  try {
    return match ? JSON.parse(match[1]) : {};
  } catch {
    return {};
  }
}

function wait(ms, signal) {
  if (!ms) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new LLMError(LLMErrorKind.TIMEOUT, 'Mock request aborted'));
    });
  });
}
