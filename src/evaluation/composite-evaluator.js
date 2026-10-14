import { Severity } from '../domain/enums.js';
import { EvaluationResult } from '../domain/evaluation-result.js';
import { LLMError, LLMErrorKind } from '../llm/llm-error.js';
import { Evaluator } from './evaluator.js';

/**
 * Rules always run and produce the score; the LLM review is added on top within a time limit.
 * If the LLM fails for any reason, the rule result is returned marked partial with a
 * learner-facing reason, so the learner always gets scored feedback.
 */
export const DEFAULT_TIMEOUT_MS = 8000;

export class CompositeEvaluator extends Evaluator {
  /**
   * @param {object} deps
   * @param {Evaluator} deps.ruleEvaluator
   * @param {Evaluator | null} [deps.llmEvaluator] null = rules only (result is complete)
   * @param {number} [deps.timeoutMs] budget for the whole LLM review, including its retry
   * @param {{warn: (message: string) => void}} [deps.logger]
   */
  constructor({ ruleEvaluator, llmEvaluator = null, timeoutMs = DEFAULT_TIMEOUT_MS, logger = console }) {
    super();
    this.ruleEvaluator = ruleEvaluator;
    this.llmEvaluator = llmEvaluator;
    this.timeoutMs = timeoutMs;
    this.logger = logger;
  }

  /**
   * @param {object} [context]
   * @param {(ruleResult: EvaluationResult) => Promise<void>} [context.onRuleResult] called as soon as
   *   rule feedback exists, so it can be shown while the LLM review is still running
   */
  async evaluate(problem, submission, { onRuleResult } = {}) {
    // Rule failures are bugs, not degraded service: let them propagate (the attempt becomes FAILED).
    const ruleResult = await this.ruleEvaluator.evaluate(problem, submission);
    if (onRuleResult) await onRuleResult(ruleResult);
    if (!this.llmEvaluator) return ruleResult;

    try {
      const llmResult = await withTimeout(
        (signal) => this.llmEvaluator.evaluate(problem, submission, { baseline: ruleResult, signal }),
        this.timeoutMs,
      );
      const extra = withoutOverlaps(ruleResult.items, llmResult.items);
      return ruleResult.merge(new EvaluationResult({ dimensionScores: ruleResult.dimensionScores, items: extra }));
    } catch (error) {
      this.logger.warn(`[evaluation] LLM review failed (${error.kind ?? 'error'}): ${error.message}`);
      return ruleResult.asPartial(describeFailure(error, this.timeoutMs));
    }
  }
}

/**
 * Runs `task` with an AbortSignal that fires after `ms`. Aborting cancels the HTTP request;
 * the race also covers clients that ignore the signal.
 */
export async function withTimeout(task, ms) {
  const controller = new AbortController();
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new LLMError(LLMErrorKind.TIMEOUT, `Timed out after ${ms} ms`));
    }, ms);
  });
  try {
    return await Promise.race([task(controller.signal), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Drops LLM items that restate a rule finding: same dimension and at least one shared evidence
 * reference, where both are problems (not info). The prompt asks the model not to repeat rule
 * findings; this enforces it, so one flaw isn't shown twice in different words.
 */
export function withoutOverlaps(ruleItems, llmItems) {
  const ruleProblems = ruleItems.filter((i) => i.severity !== Severity.INFO);
  return llmItems.filter((llmItem) => {
    if (llmItem.severity === Severity.INFO) return true;
    const refs = new Set(llmItem.evidence.map((e) => e.toLowerCase()));
    return !ruleProblems.some((r) => r.dimension === llmItem.dimension && r.evidence.some((e) => refs.has(e.toLowerCase())));
  });
}

const RULES_ARE_COMPLETE = 'Your score and rule-based feedback are complete.';

function describeFailure(error, timeoutMs) {
  switch (error instanceof LLMError ? error.kind : null) {
    case LLMErrorKind.TIMEOUT:
      return `The AI review took longer than ${Math.round(timeoutMs / 1000)}s and was stopped. ${RULES_ARE_COMPLETE} You can retry the AI review.`;
    case LLMErrorKind.INVALID_RESPONSE:
      return `The AI review returned an unusable answer twice. ${RULES_ARE_COMPLETE} You can retry the AI review.`;
    case LLMErrorKind.RATE_LIMITED:
      return `The AI reviewer is busy right now. ${RULES_ARE_COMPLETE} Retry the AI review in a minute.`;
    case LLMErrorKind.AUTH:
      return `The AI review is unavailable (the server's AI key was rejected). ${RULES_ARE_COMPLETE}`;
    case LLMErrorKind.REFUSED:
      return `The AI reviewer declined to review this submission. ${RULES_ARE_COMPLETE}`;
    default:
      return `The AI review failed. ${RULES_ARE_COMPLETE} You can retry the AI review.`;
  }
}
