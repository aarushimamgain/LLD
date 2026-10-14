import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Attempt, DimensionScore, Dimension, EvaluationResult, FeedbackItem, Severity, Submission } from '../src/domain/index.js';

const problemsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'problems');

export async function loadSample(problemId) {
  return JSON.parse(await readFile(path.join(problemsDir, 'samples', `${problemId}.json`), 'utf8'));
}

export function makeSubmission(overrides = {}) {
  return new Submission({
    entities: [{ name: 'ParkingLot', kind: 'class', responsibilities: ['Hold floors'], methods: [] }],
    ...overrides,
  });
}

/** Builds a result where every dimension earned `earned` of 10 points. */
export function makeResult({ earned = 10, items = [] } = {}) {
  return new EvaluationResult({
    dimensionScores: Object.values(Dimension).map((dimension) => new DimensionScore({ dimension, earned, possible: 10, weight: 20 })),
    items,
  });
}

export function makeIssue(key, overrides = {}) {
  return new FeedbackItem({
    key,
    dimension: Dimension.RESPONSIBILITIES,
    severity: Severity.ISSUE,
    message: `Finding ${key}`,
    evidence: ['ParkingLot'],
    suggestion: 'Fix it',
    ...overrides,
  });
}

/** An attempt that has gone DRAFT → SUBMITTED, ready for evaluation. */
export function makeSubmittedAttempt({ learnerId = 'learner-1', problemId = 'parking-lot', attemptNumber = 1, now = new Date() } = {}) {
  const attempt = Attempt.start({ learnerId, problemId, attemptNumber, now });
  attempt.submit(makeSubmission(), now);
  return attempt;
}
