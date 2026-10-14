import { CompositeEvaluator } from './composite-evaluator.js';
import { LLMEvaluator } from './llm-evaluator.js';
import { RuleBasedEvaluator } from './rule-based-evaluator.js';

/**
 * The evaluator the app uses: rules for the score, plus an LLM review bounded by `timeoutMs`.
 * @param {object} deps
 * @param {import('../llm/llm-client.js').LLMClient} deps.llmClient
 * @param {number} deps.timeoutMs
 * @param {{warn: (message: string) => void}} [deps.logger]
 */
export function createEvaluator({ llmClient, timeoutMs, logger }) {
  return new CompositeEvaluator({
    ruleEvaluator: new RuleBasedEvaluator(),
    llmEvaluator: new LLMEvaluator(llmClient),
    timeoutMs,
    logger,
  });
}
