import { Attempt, AttemptStatus, ConflictError, InvalidTransitionError } from '../../src/domain/index.js';
import { makeResult, makeSubmission, makeSubmittedAttempt } from '../helpers.js';

const { DRAFT, SUBMITTED, EVALUATING, EVALUATED, PARTIALLY_EVALUATED, FAILED } = AttemptStatus;

const newDraft = () => Attempt.start({ learnerId: 'learner-1', problemId: 'parking-lot', attemptNumber: 1 });

/** Builds an attempt in the given state using only legal transitions. */
function inState(status) {
  const attempt = newDraft();
  if (status === DRAFT) return attempt;
  attempt.submit(makeSubmission());
  if (status === SUBMITTED) return attempt;
  attempt.startEvaluation();
  if (status === EVALUATED) attempt.complete(makeResult());
  if (status === PARTIALLY_EVALUATED) attempt.completePartially(makeResult(), 'AI review timed out');
  if (status === FAILED) attempt.fail('boom');
  return attempt;
}

const ACTIONS = {
  submit: { to: SUBMITTED, run: (a) => a.submit(makeSubmission()) },
  startEvaluation: { to: EVALUATING, run: (a) => a.startEvaluation() },
  complete: { to: EVALUATED, run: (a) => a.complete(makeResult()) },
  completePartially: { to: PARTIALLY_EVALUATED, run: (a) => a.completePartially(makeResult(), 'reason') },
  fail: { to: FAILED, run: (a) => a.fail('reason') },
};

// The full state machine from docs/DESIGN.md. Anything not listed must throw.
const ALLOWED = {
  [DRAFT]: ['submit'],
  [SUBMITTED]: ['startEvaluation'],
  [EVALUATING]: ['complete', 'completePartially', 'fail'],
  [EVALUATED]: [],
  [PARTIALLY_EVALUATED]: ['startEvaluation'],
  [FAILED]: ['startEvaluation'],
};

describe('Attempt state machine', () => {
  const cases = Object.entries(ALLOWED).flatMap(([from, allowed]) =>
    Object.keys(ACTIONS).map((action) => [from, action, allowed.includes(action)]));

  it.each(cases.filter(([, , ok]) => ok))('%s --%s--> allowed', (from, action) => {
    const attempt = inState(from);
    ACTIONS[action].run(attempt);
    expect(attempt.status).toBe(ACTIONS[action].to);
  });

  it.each(cases.filter(([, , ok]) => !ok))('%s --%s--> throws and leaves the attempt unchanged', (from, action) => {
    const attempt = inState(from);
    const before = attempt.toJSON();
    expect(() => ACTIONS[action].run(attempt)).toThrow(InvalidTransitionError);
    expect(attempt.toJSON()).toEqual(before);
  });

  it('rejects submitting an EVALUATED attempt', () => {
    expect(() => inState(EVALUATED).submit(makeSubmission())).toThrow('Cannot move attempt from EVALUATED to SUBMITTED');
  });

  it('only allows a preliminary result while EVALUATING', () => {
    const evaluating = inState(EVALUATING);
    evaluating.recordPreliminaryResult(makeResult());
    expect(evaluating.status).toBe(EVALUATING);
    expect(evaluating.result).not.toBeNull();
    for (const status of [DRAFT, SUBMITTED, EVALUATED, PARTIALLY_EVALUATED, FAILED]) {
      expect(() => inState(status).recordPreliminaryResult(makeResult())).toThrow(InvalidTransitionError);
    }
  });

  it('marks exactly PARTIALLY_EVALUATED and FAILED as retryable', () => {
    const retryable = Object.keys(ALLOWED).filter((status) => inState(status).isRetryable);
    expect(retryable).toEqual([PARTIALLY_EVALUATED, FAILED]);
  });
});

describe('Attempt drafts', () => {
  it('starts as a DRAFT with a generated id and no submission', () => {
    const attempt = newDraft();
    expect(attempt.status).toBe(DRAFT);
    expect(attempt.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(attempt.submission).toBeNull();
    expect(attempt.draftText).toBe('');
  });

  it('accepts any draft text, including invalid JSON, until submitted', () => {
    const attempt = newDraft();
    attempt.saveDraft('{ "entities": [');
    expect(attempt.draftText).toBe('{ "entities": [');
  });

  it.each([SUBMITTED, EVALUATING, EVALUATED, FAILED])('cannot be edited once %s', (status) => {
    expect(() => inState(status).saveDraft('x')).toThrow(ConflictError);
  });

  it('keeps the reason for partial and failed evaluations and clears it on retry', () => {
    const attempt = inState(PARTIALLY_EVALUATED);
    expect(attempt.statusMessage).toBe('AI review timed out');
    attempt.startEvaluation();
    expect(attempt.statusMessage).toBeNull();
  });

  it.each([DRAFT, PARTIALLY_EVALUATED])('round-trips a %s attempt through JSON', (status) => {
    const attempt = status === DRAFT ? newDraft() : inState(status);
    if (status === DRAFT) attempt.saveDraft('{"entities": []}');
    const copy = Attempt.fromJSON(JSON.parse(JSON.stringify(attempt)));
    expect(copy.toJSON()).toEqual(attempt.toJSON());
  });

  it('cannot be constructed in a non-draft state without a submission', () => {
    expect(() => new Attempt({ id: 'a', learnerId: 'l', problemId: 'p', attemptNumber: 1, status: SUBMITTED })).toThrow(/needs a Submission/);
    expect(makeSubmittedAttempt().status).toBe(SUBMITTED);
  });
});
