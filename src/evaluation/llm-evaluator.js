import { z } from 'zod';
import { Dimension, FeedbackSource, Severity } from '../domain/enums.js';
import { EvaluationResult } from '../domain/evaluation-result.js';
import { FeedbackItem } from '../domain/feedback-item.js';
import { LLMError, LLMErrorKind } from '../llm/llm-error.js';
import { SUBMISSION_SECTIONS } from './analysis.js';
import { Evaluator } from './evaluator.js';
import { buildFeedbackPrompt, buildRetryPrompt } from './llm-prompt.js';

const MAX_ITEMS = 6;

const replySchema = z.object({
  items: z.array(z.object({
    dimension: z.enum(Object.values(Dimension)),
    severity: z.enum(Object.values(Severity)),
    message: z.string().trim().min(1).max(800),
    evidence: z.array(z.string().trim().min(1)).min(1).max(6),
    suggestion: z.string().trim().min(1).max(800),
  })).max(12),
});

/**
 * Qualitative review by an LLM. Returns the baseline (rule) scores unchanged plus LLM items:
 * the LLM never affects the score.
 */
export class LLMEvaluator extends Evaluator {
  /**
   * @param {import('../llm/llm-client.js').LLMClient} client
   * @param {{maxAttempts?: number}} [options] attempts including the one retry on invalid output
   */
  constructor(client, { maxAttempts = 2 } = {}) {
    super();
    this.client = client;
    this.maxAttempts = maxAttempts;
  }

  /**
   * @param {object} context
   * @param {import('../domain/evaluation-result.js').EvaluationResult} context.baseline rule result (shown to the model, scores reused)
   * @param {AbortSignal} [context.signal]
   * @throws {LLMError} on provider failure, or invalid output after all attempts
   */
  async evaluate(problem, submission, { baseline, signal } = {}) {
    if (!baseline) throw new Error('LLMEvaluator needs the rule-based result as baseline');

    let prompt = buildFeedbackPrompt({ problem, submission, ruleResult: baseline });
    for (let attempt = 1; ; attempt++) {
      const reply = await this.client.complete(prompt, { signal });
      const parsed = parseReply(reply);
      if (parsed.ok) {
        return new EvaluationResult({
          dimensionScores: baseline.dimensionScores,
          items: toFeedbackItems(parsed.items, problem, submission),
        });
      }
      if (attempt >= this.maxAttempts) {
        throw new LLMError(LLMErrorKind.INVALID_RESPONSE, `Unusable LLM reply after ${attempt} attempts: ${parsed.error}`);
      }
      prompt = buildRetryPrompt(prompt, parsed.error);
    }
  }
}

function parseReply(reply) {
  // Some models wrap JSON in a markdown fence despite instructions; that alone shouldn't cost a retry.
  const text = reply.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  let json;
  try {
    json = JSON.parse(text);
  } catch (error) {
    return { ok: false, error: `not valid JSON (${error.message})` };
  }
  const result = replySchema.safeParse(json);
  if (!result.success) return { ok: false, error: `JSON does not match the schema: ${z.prettifyError(result.error)}` };
  return { ok: true, items: result.data.items };
}

/**
 * Keeps only evidence that points at something real (declared entity, requirement id, section),
 * normalised to its canonical spelling. Items left without evidence are dropped: an uncheckable
 * claim is worse than no claim.
 */
function toFeedbackItems(items, problem, submission) {
  const known = new Map(
    [...submission.entities.map((e) => e.name), ...problem.requirements.map((r) => r.id), ...SUBMISSION_SECTIONS]
      .map((ref) => [ref.toLowerCase(), ref]),
  );
  const resolve = (ref) => known.get(ref.toLowerCase()) ?? known.get(ref.split(/[.(\s]/)[0].toLowerCase());

  return items
    .map((item) => ({ ...item, evidence: [...new Set(item.evidence.map(resolve).filter(Boolean))] }))
    .filter((item) => item.evidence.length > 0)
    .slice(0, MAX_ITEMS)
    .map((item) => new FeedbackItem({ ...item, key: null, source: FeedbackSource.LLM }));
}
