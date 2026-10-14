import { FeedbackItem } from '../../domain/feedback-item.js';
import { FeedbackSource } from '../../domain/enums.js';

/**
 * One deterministic check. Each rule owns one dimension and returns findings only;
 * scoring turns findings into points (see scoring.js).
 * @abstract
 */
export class Rule {
  /**
   * @param {object} props
   * @param {string} props.dimension one of Dimension
   */
  constructor({ dimension }) {
    this.dimension = dimension;
  }

  /**
   * @param {import('../../domain/problem.js').Problem} problem
   * @param {import('../../domain/submission.js').Submission} submission
   * @returns {FeedbackItem[]}
   */
  check(problem, submission) {
    throw new Error('Not implemented');
  }

  /**
   * Builds a finding for this rule. `key` must be stable across attempts (no message text,
   * no indexes) so the history view can tell which issues were fixed.
   */
  finding({ key, severity, message, evidence, suggestion }) {
    return new FeedbackItem({ key, dimension: this.dimension, severity, message, evidence, suggestion, source: FeedbackSource.RULE });
  }
}
