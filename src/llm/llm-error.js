/** Why an LLM call failed. The evaluator turns these into learner-facing messages. */
export const LLMErrorKind = Object.freeze({
  TIMEOUT: 'timeout',
  INVALID_RESPONSE: 'invalid_response',
  AUTH: 'auth',
  RATE_LIMITED: 'rate_limited',
  REFUSED: 'refused',
  PROVIDER: 'provider',
});

export class LLMError extends Error {
  /**
   * @param {string} kind one of LLMErrorKind
   * @param {string} message for logs, not for learners (may contain provider details)
   */
  constructor(kind, message, options) {
    super(message, options);
    this.name = 'LLMError';
    this.kind = kind;
  }
}
