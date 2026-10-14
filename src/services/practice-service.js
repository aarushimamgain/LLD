import { Attempt } from '../domain/attempt.js';
import { compareAttempts } from '../domain/attempt-comparison.js';
import { AttemptStatus } from '../domain/enums.js';
import { ConflictError, NotFoundError } from '../domain/errors.js';
import { analyzeConcepts } from '../evaluation/analysis.js';

const EVALUATION_ERROR = 'Evaluation failed because of an error on our side. You can retry the evaluation.';
const INTERRUPTED = 'The server restarted while this attempt was being evaluated. You can retry the evaluation.';

/**
 * The learner's use cases: practise a problem, draft, submit, get feedback, retry, review history.
 * Depends only on interfaces (repository, evaluator, parser) and the catalog, all injected.
 */
export class PracticeService {
  #attempts;
  #problems;
  #evaluator;
  #parser;
  #logger;
  #clock;
  #background = new Set();

  /**
   * @param {object} deps
   * @param {import('../repositories/attempt-repository.js').AttemptRepository} deps.attemptRepository
   * @param {import('../repositories/problem-catalog.js').ProblemCatalog} deps.problemCatalog
   * @param {import('../evaluation/evaluator.js').Evaluator} deps.evaluator
   * @param {import('../parsers/submission-parser.js').SubmissionParser} deps.parser
   * @param {{warn: Function, error: Function}} [deps.logger]
   * @param {() => Date} [deps.clock]
   */
  constructor({ attemptRepository, problemCatalog, evaluator, parser, logger = console, clock = () => new Date() }) {
    this.#attempts = attemptRepository;
    this.#problems = problemCatalog;
    this.#evaluator = evaluator;
    this.#parser = parser;
    this.#logger = logger;
    this.#clock = clock;
  }

  listProblems() {
    return this.#problems.list();
  }

  getProblem(problemId) {
    return this.#problems.get(problemId).toLearnerView();
  }

  getSample(problemId) {
    return this.#problems.sample(problemId);
  }

  /**
   * Opens a draft for a problem. Returns the existing open draft if there is one, so the learner
   * never has two competing drafts. A new draft starts from the learner's previous design (when
   * there is one), so improving means editing, not retyping.
   * @returns {Promise<{attempt: Attempt, created: boolean}>}
   */
  async startAttempt({ learnerId, problemId }) {
    this.#problems.get(problemId); // 404 for unknown problems
    const attempts = await this.#attempts.listByLearnerAndProblem(learnerId, problemId);

    const openDraft = attempts.find((a) => a.isDraft);
    if (openDraft) return { attempt: openDraft, created: false };

    const previous = attempts.findLast((a) => a.submission !== null);
    const attempt = Attempt.start({
      learnerId,
      problemId,
      attemptNumber: Math.max(0, ...attempts.map((a) => a.attemptNumber)) + 1,
      draftText: previous ? JSON.stringify(previous.submission.toJSON(), null, 2) : '',
      now: this.#clock(),
    });
    return { attempt: await this.#attempts.save(attempt), created: true };
  }

  async saveDraft(attemptId, { learnerId, draftText }) {
    const attempt = await this.#ownedAttempt(attemptId, learnerId);
    attempt.saveDraft(draftText, this.#clock());
    return this.#attempts.save(attempt);
  }

  /**
   * Validates the draft and submits it. Returns as soon as the attempt is SUBMITTED; evaluation
   * runs in the background and the client polls getAttempt().
   * @throws {import('../domain/errors.js').ValidationError} when the draft isn't a valid design (the draft is kept)
   */
  async submit(attemptId, { learnerId, draftText }) {
    const attempt = await this.#ownedAttempt(attemptId, learnerId);
    if (!attempt.isDraft) throw new ConflictError('This attempt has already been submitted.');

    // Save the latest text first, so the learner's work survives even if validation fails.
    if (draftText !== undefined && draftText !== attempt.draftText) {
      attempt.saveDraft(draftText, this.#clock());
      await this.#attempts.save(attempt);
    }

    attempt.submit(this.#parser.parse(attempt.draftText), this.#clock());
    const saved = await this.#attempts.save(attempt);
    this.#inBackground(() => this.runEvaluation(saved.id));
    return saved;
  }

  /** SUBMITTED → EVALUATING → EVALUATED | PARTIALLY_EVALUATED | FAILED, persisted at each step. */
  async runEvaluation(attemptId) {
    const attempt = await this.#attempts.findById(attemptId);
    if (!attempt) throw new NotFoundError(`No attempt with id "${attemptId}"`);
    attempt.startEvaluation(this.#clock());
    await this.#attempts.save(attempt);
    await this.#evaluate(attempt);
  }

  /** Re-runs evaluation for a FAILED or PARTIALLY_EVALUATED attempt. Returns once it is EVALUATING. */
  async retryEvaluation(attemptId, { learnerId }) {
    const attempt = await this.#ownedAttempt(attemptId, learnerId);
    if (!attempt.isRetryable) {
      throw new ConflictError(`Only attempts whose evaluation failed or was partial can be retried; this one is ${attempt.status}.`);
    }
    // Transition before responding, so a double click gets a 409 instead of two evaluations.
    attempt.startEvaluation(this.#clock());
    const saved = await this.#attempts.save(attempt);
    this.#inBackground(() => this.#evaluate(saved));
    return saved;
  }

  /**
   * The attempt, its comparison with the previous scored attempt, and which rubric concepts the
   * submitted design covers. Concepts are only revealed once a design is submitted: before that
   * they would be the answer key.
   * @returns {Promise<{attempt: Attempt, comparison: object|null, concepts: object[]|null}>}
   */
  async getAttempt(attemptId) {
    const attempt = await this.#attempts.findById(attemptId);
    if (!attempt) throw new NotFoundError(`No attempt with id "${attemptId}"`);
    return {
      attempt,
      comparison: await this.#comparisonWithPrevious(attempt),
      concepts: attempt.submission ? this.#conceptCoverage(attempt) : null,
    };
  }

  /** Comparison of an attempt with the learner's previous scored attempt at the same problem, or null. */
  async compareWithPrevious(attemptId) {
    return (await this.getAttempt(attemptId)).comparison;
  }

  /**
   * Attempt summaries (oldest first). With a problem, also compares the latest two scored attempts.
   * @returns {Promise<{attempts: object[], comparison: object|null}>}
   */
  async getHistory(learnerId, { problemId } = {}) {
    if (!problemId) {
      const attempts = await this.#attempts.listByLearner(learnerId);
      return { attempts: attempts.map((a) => a.toSummary()), comparison: null };
    }
    this.#problems.get(problemId);
    const attempts = await this.#attempts.listByLearnerAndProblem(learnerId, problemId);
    const scored = attempts.filter((a) => a.hasScores);
    return {
      attempts: attempts.map((a) => a.toSummary()),
      comparison: scored.length >= 2 ? compareAttempts(scored.at(-2), scored.at(-1)) : null,
    };
  }

  /**
   * Marks attempts left in EVALUATING by a crash or restart as FAILED (retryable).
   * Call once at startup, before serving requests. Assumes a single server instance.
   * @returns {Promise<number>} how many attempts were recovered
   */
  async recoverStuckEvaluations() {
    const stuck = await this.#attempts.findStuckEvaluating({ olderThan: this.#clock() });
    for (const attempt of stuck) {
      attempt.fail(INTERRUPTED, this.#clock());
      await this.#attempts.save(attempt);
    }
    return stuck.length;
  }

  /** Resolves when all background evaluations have finished. For tests and graceful shutdown. */
  async whenIdle() {
    while (this.#background.size > 0) await Promise.allSettled([...this.#background]);
  }

  async #evaluate(attempt) {
    let result;
    try {
      const problem = this.#problems.get(attempt.problemId);
      result = await this.#evaluator.evaluate(problem, attempt.submission, {
        // Rule feedback is saved immediately, so polling shows it while the LLM review runs.
        onRuleResult: (ruleResult) => this.#updateIfEvaluating(attempt.id, (a) => a.recordPreliminaryResult(ruleResult, this.#clock())),
      });
    } catch (error) {
      this.#logger.error(`[evaluation] attempt ${attempt.id} failed: ${error.stack ?? error}`);
      await this.#updateIfEvaluating(attempt.id, (a) => a.fail(EVALUATION_ERROR, this.#clock()));
      return;
    }
    await this.#updateIfEvaluating(attempt.id, (a) => (result.isPartial
      ? a.completePartially(result, result.partialReason, this.#clock())
      : a.complete(result, this.#clock())));
  }

  /**
   * Re-reads the attempt and applies `change` only if it is still EVALUATING, so a late result
   * can't overwrite a newer state (e.g. the attempt was marked FAILED meanwhile).
   */
  async #updateIfEvaluating(attemptId, change) {
    const fresh = await this.#attempts.findById(attemptId);
    if (fresh?.status !== AttemptStatus.EVALUATING) {
      this.#logger.warn(`[evaluation] attempt ${attemptId} is ${fresh?.status ?? 'gone'}; dropping a late evaluation update`);
      return null;
    }
    change(fresh);
    return this.#attempts.save(fresh);
  }

  #conceptCoverage(attempt) {
    return analyzeConcepts(this.#problems.get(attempt.problemId), attempt.submission).map(({ concept, entities, substantive }) => ({
      id: concept.id,
      name: concept.name,
      covered: substantive.length > 0,
      entities: entities.map((e) => e.name),
    }));
  }

  async #comparisonWithPrevious(attempt) {
    if (!attempt.hasScores) return null;
    const attempts = await this.#attempts.listByLearnerAndProblem(attempt.learnerId, attempt.problemId);
    const previous = attempts.filter((a) => a.hasScores && a.attemptNumber < attempt.attemptNumber).at(-1);
    return previous ? compareAttempts(previous, attempt) : null;
  }

  /**
   * Without auth, the learnerId is the only ownership check. A mismatch is reported as
   * "not found" so attempt ids can't be probed.
   */
  async #ownedAttempt(attemptId, learnerId) {
    const attempt = await this.#attempts.findById(attemptId);
    if (!attempt || attempt.learnerId !== learnerId) throw new NotFoundError(`No attempt with id "${attemptId}"`);
    return attempt;
  }

  #inBackground(task) {
    const run = Promise.resolve()
      .then(task)
      .catch((error) => this.#logger.error(`[evaluation] background task failed: ${error.stack ?? error}`))
      .finally(() => this.#background.delete(run));
    this.#background.add(run);
  }
}
