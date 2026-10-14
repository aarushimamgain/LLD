import { AttemptStatus } from './enums.js';
import { ConflictError, InvalidTransitionError } from './errors.js';
import { EvaluationResult } from './evaluation-result.js';
import { Submission } from './submission.js';

const { DRAFT, SUBMITTED, EVALUATING, EVALUATED, PARTIALLY_EVALUATED, FAILED } = AttemptStatus;

const ALLOWED_TRANSITIONS = Object.freeze({
  [DRAFT]: [SUBMITTED],
  [SUBMITTED]: [EVALUATING],
  [EVALUATING]: [EVALUATED, PARTIALLY_EVALUATED, FAILED],
  [EVALUATED]: [],
  [PARTIALLY_EVALUATED]: [EVALUATING],
  [FAILED]: [EVALUATING],
});

/**
 * One attempt at a problem, from draft to evaluated:
 *
 *   DRAFT → SUBMITTED → EVALUATING → EVALUATED | PARTIALLY_EVALUATED | FAILED
 *   PARTIALLY_EVALUATED | FAILED → EVALUATING   (retry)
 *
 * A draft holds the learner's raw editor text, which may be incomplete or invalid; it becomes a
 * validated Submission only on submit. Every state change goes through #transition, which
 * throws InvalidTransitionError otherwise.
 */
export class Attempt {
  #status;
  #draftText;
  #submission;
  #result;
  #statusMessage;
  #updatedAt;

  constructor({ id, learnerId, problemId, attemptNumber, status = DRAFT, draftText = '', submission = null, result = null, statusMessage = null, createdAt = new Date(), updatedAt = createdAt }) {
    if (!id || !learnerId || !problemId) throw new Error('Attempt needs id, learnerId and problemId');
    if (!Number.isInteger(attemptNumber) || attemptNumber < 1) throw new Error('Attempt needs a positive integer attemptNumber');
    if (!(status in ALLOWED_TRANSITIONS)) throw new Error(`Unknown attempt status: ${status}`);
    if (typeof draftText !== 'string') throw new Error('draftText must be a string');
    if (status !== DRAFT && !(submission instanceof Submission)) throw new Error(`A ${status} attempt needs a Submission`);

    this.id = id;
    this.learnerId = learnerId;
    this.problemId = problemId;
    /** 1-based position among this learner's attempts at this problem. */
    this.attemptNumber = attemptNumber;
    this.createdAt = new Date(createdAt);
    this.#status = status;
    this.#draftText = draftText;
    this.#submission = submission;
    this.#result = result;
    this.#statusMessage = statusMessage;
    this.#updatedAt = new Date(updatedAt);
  }

  /** Starts a new attempt as a DRAFT. */
  static start({ learnerId, problemId, attemptNumber, draftText = '', id = globalThis.crypto.randomUUID(), now = new Date() }) {
    return new Attempt({ id, learnerId, problemId, attemptNumber, draftText, createdAt: now });
  }

  get status() { return this.#status; }
  get draftText() { return this.#draftText; }
  /** @returns {Submission|null} null while still a draft */
  get submission() { return this.#submission; }
  get result() { return this.#result; }
  get statusMessage() { return this.#statusMessage; }
  get updatedAt() { return this.#updatedAt; }

  get isDraft() {
    return this.#status === DRAFT;
  }

  get isRetryable() {
    return this.#status === PARTIALLY_EVALUATED || this.#status === FAILED;
  }

  /** True once evaluation has produced scores (fully or partially). */
  get hasScores() {
    return this.#result !== null && (this.#status === EVALUATED || this.#status === PARTIALLY_EVALUATED);
  }

  /** Replaces the draft text. Only drafts can be edited: a submitted design is a fixed record. */
  saveDraft(draftText, now = new Date()) {
    if (!this.isDraft) {
      throw new ConflictError('This attempt has already been submitted and can no longer be edited. Start a new attempt to change your design.');
    }
    if (typeof draftText !== 'string') throw new Error('draftText must be a string');
    this.#draftText = draftText;
    this.#updatedAt = now;
  }

  /** @param {Submission} submission the parsed, validated draft */
  submit(submission, now = new Date()) {
    if (!(submission instanceof Submission)) throw new Error('submit() needs a Submission');
    this.#transition(SUBMITTED, now);
    this.#submission = submission;
  }

  startEvaluation(now = new Date()) {
    this.#transition(EVALUATING, now);
    this.#statusMessage = null;
  }

  /**
   * Stores rule-based results while the LLM review is still running, so the learner sees
   * feedback immediately. Does not change status.
   * @param {EvaluationResult} result
   */
  recordPreliminaryResult(result, now = new Date()) {
    if (this.#status !== EVALUATING) {
      throw new InvalidTransitionError(this.#status, `${EVALUATING} (preliminary result)`);
    }
    this.#result = requireResult(result);
    this.#updatedAt = now;
  }

  /** @param {EvaluationResult} result */
  complete(result, now = new Date()) {
    this.#transition(EVALUATED, now);
    this.#result = requireResult(result);
    this.#statusMessage = null;
  }

  /**
   * Rules finished but the LLM review did not (timeout, error, invalid output).
   * @param {EvaluationResult} result rule-based result
   * @param {string} reason learner-facing explanation
   */
  completePartially(result, reason, now = new Date()) {
    this.#transition(PARTIALLY_EVALUATED, now);
    this.#result = requireResult(result);
    this.#statusMessage = reason;
  }

  /** Evaluation could not produce scores. Any preliminary result is kept for display. */
  fail(reason, now = new Date()) {
    this.#transition(FAILED, now);
    this.#statusMessage = reason;
  }

  #transition(to, now) {
    if (!ALLOWED_TRANSITIONS[this.#status].includes(to)) {
      throw new InvalidTransitionError(this.#status, to);
    }
    this.#status = to;
    this.#updatedAt = now;
  }

  toJSON() {
    return {
      id: this.id,
      learnerId: this.learnerId,
      problemId: this.problemId,
      attemptNumber: this.attemptNumber,
      status: this.#status,
      statusMessage: this.#statusMessage,
      isRetryable: this.isRetryable,
      draftText: this.#draftText,
      submission: this.#submission ? this.#submission.toJSON() : null,
      result: this.#result ? this.#result.toJSON() : null,
      createdAt: this.createdAt.toISOString(),
      updatedAt: this.#updatedAt.toISOString(),
    };
  }

  /** Compact form for history lists: scores without the full feedback or design. */
  toSummary() {
    const result = this.#result;
    return {
      id: this.id,
      problemId: this.problemId,
      attemptNumber: this.attemptNumber,
      status: this.#status,
      statusMessage: this.#statusMessage,
      isRetryable: this.isRetryable,
      totalScore: this.hasScores ? result.totalScore : null,
      maxScore: this.hasScores ? result.maxScore : null,
      dimensionScores: this.hasScores ? result.dimensionScores.map((s) => s.toJSON()) : [],
      createdAt: this.createdAt.toISOString(),
      updatedAt: this.#updatedAt.toISOString(),
    };
  }

  /** Rehydrates from toJSON() output (used by repositories). Skips transition checks on purpose. */
  static fromJSON(json) {
    return new Attempt({
      ...json,
      submission: json.submission ? Submission.fromJSON(json.submission) : null,
      result: json.result ? EvaluationResult.fromJSON(json.result) : null,
    });
  }
}

function requireResult(result) {
  if (!(result instanceof EvaluationResult)) throw new Error('Expected an EvaluationResult');
  return result;
}
