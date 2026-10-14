import { Dimension, FeedbackSource, Severity, assertOneOf } from './enums.js';

/**
 * One explainable finding about a submission.
 * `key` is stable across attempts for RULE items (e.g. "SRP:ParkingLot") so attempts can be diffed;
 * LLM items have no key because their wording changes between runs.
 */
export class FeedbackItem {
  /**
   * @param {object} props
   * @param {string|null} [props.key]
   * @param {string} props.dimension one of Dimension
   * @param {string} props.severity one of Severity
   * @param {string} props.message what was found
   * @param {string|string[]} props.evidence entity names, requirement ids or submission sections the item points at
   * @param {string} props.suggestion what to change next attempt
   * @param {string} [props.source] one of FeedbackSource
   */
  constructor({ key = null, dimension, severity, message, evidence, suggestion, source = FeedbackSource.RULE }) {
    assertOneOf(dimension, Dimension, 'dimension');
    assertOneOf(severity, Severity, 'severity');
    assertOneOf(source, FeedbackSource, 'source');
    if (!message) throw new Error('FeedbackItem needs a message');
    const refs = (Array.isArray(evidence) ? evidence : [evidence]).filter(Boolean);
    // Feedback that doesn't point at something, or doesn't say what to do, isn't actionable.
    if (refs.length === 0) throw new Error(`FeedbackItem needs evidence: ${message}`);
    if (refs.some((ref) => typeof ref !== 'string')) throw new Error(`FeedbackItem evidence must be names or ids: ${message}`);
    if (!suggestion) throw new Error(`FeedbackItem needs a suggestion: ${message}`);

    this.key = key;
    this.dimension = dimension;
    this.severity = severity;
    this.message = message;
    this.evidence = Object.freeze(refs);
    this.suggestion = suggestion;
    this.source = source;
    Object.freeze(this);
  }

  /** Only keyed rule items take part in attempt-to-attempt comparison. */
  get isComparable() {
    return this.source === FeedbackSource.RULE && this.key !== null;
  }

  toJSON() {
    const { key, dimension, severity, message, evidence, suggestion, source } = this;
    return { key, dimension, severity, message, evidence: [...evidence], suggestion, source };
  }

  static fromJSON(json) {
    return new FeedbackItem(json);
  }
}
