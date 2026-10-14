/**
 * @typedef {object} LLMRequest
 * @property {string} system instructions
 * @property {string} user the content to work on
 * @property {object} [jsonSchema] JSON Schema the reply must match; providers that support
 *   structured output enforce it, the others are asked for JSON and validated afterwards
 */

/**
 * A text-in, text-out chat model. One implementation per provider, chosen by LLM_PROVIDER.
 * @abstract
 */
export class LLMClient {
  /** Short label for logs, e.g. "anthropic:claude-opus-5-5". */
  get name() {
    throw new Error('Not implemented');
  }

  /**
   * @param {LLMRequest} request
   * @param {{signal?: AbortSignal}} [options] aborting must cancel the underlying request
   * @returns {Promise<string>} the model's text reply
   * @throws {import('./llm-error.js').LLMError}
   */
  async complete(request, options) {
    throw new Error('Not implemented');
  }
}
