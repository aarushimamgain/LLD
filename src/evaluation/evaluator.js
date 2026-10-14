/**
 * Produces an EvaluationResult for a submission. One implementation per technique
 * (rules, LLM, a composite of both).
 * @abstract
 */
export class Evaluator {
  /**
   * @param {import('../domain/problem.js').Problem} problem
   * @param {import('../domain/submission.js').Submission} submission
   * @param {object} [context] implementation-specific options (abort signal, baseline result, callbacks)
   * @returns {Promise<import('../domain/evaluation-result.js').EvaluationResult>}
   */
  async evaluate(problem, submission, context) {
    throw new Error('Not implemented');
  }
}
