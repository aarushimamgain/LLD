/**
 * Turns raw learner input into a Submission. One implementation per input format
 * (structured JSON now; PlantUML or code later), so evaluators never deal with formats.
 * @abstract
 */
export class SubmissionParser {
  /**
   * @param {unknown} raw the request body or text the learner submitted
   * @returns {import('../domain/submission.js').Submission}
   * @throws {import('../domain/errors.js').ValidationError} with learner-friendly `details`
   */
  parse(raw) {
    throw new Error('Not implemented');
  }
}
